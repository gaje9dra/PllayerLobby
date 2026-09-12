import "server-only";

import { Prisma, WalletDepositStatus } from "@/app/generated/prisma/client";
import { requireActiveUser } from "@/lib/auth";
import { getPayUConfig, generatePayURequestHash, validatePayUResponseHash, type PayURequestFields, type PayUResponseFields } from "@/lib/payu";
import { verifyPayUTransaction, type PayUVerificationResult } from "@/lib/payu-verification";
import { creditVerifiedDepositInTransaction } from "@/lib/wallet";
import { prisma } from "@/lib/prisma";
import { normalizePaymentAmount } from "@/lib/payment-verification-rules";
import { isValidUuid } from "@/lib/wallet-rules";

const PHONE_PATTERN = /^[6-9][0-9]{9}$/;
const DEPOSIT_REFERENCE_PATTERN = /^DEP-[A-Z0-9]{12}$/;

export type WalletDepositPaymentResult =
  | { ok: true; depositId: string; reference: string; checkoutUrl: string; fields: PayURequestFields }
  | { ok: false; code: string; message: string };

export type WalletDepositVerificationOutcome = "SUCCESS" | "FAILED" | "PENDING" | "REJECTED";
export type WalletDepositVerificationResult = { outcome: WalletDepositVerificationOutcome; depositId: string | null; message: string };

function firstNameFromUser(name: string | null) { return name?.trim().split(/\s+/)[0] || "Player"; }
function productInfo(reference: string) { return `PlayerLobby Wallet Deposit - ${reference}`.slice(0, 100); }
function safeMessage(outcome: WalletDepositVerificationOutcome) {
  switch (outcome) {
    case "SUCCESS": return "Payment verified and money has been added to your wallet.";
    case "FAILED": return "Payment was unsuccessful. Your wallet was not credited.";
    case "PENDING": return "Your payment is being verified. Your wallet has not been credited yet.";
    case "REJECTED": return "Payment verification could not be completed.";
  }
}
function invalid(message: string): WalletDepositPaymentResult { return { ok: false, code: "PAYMENT_UNAVAILABLE", message }; }

export async function createPayUWalletDepositPayment(depositId: string, phoneInput = ""): Promise<WalletDepositPaymentResult> {
  if (!isValidUuid(depositId)) return invalid("Deposit not found.");
  const user = await requireActiveUser();
  const config = getPayUConfig();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return invalid("Payment is temporarily unavailable. Please try again later.");
  let callbackUrl: string;
  try { callbackUrl = new URL("/api/payu/wallet-deposit/callback", appUrl).toString(); } catch { return invalid("Payment is temporarily unavailable. Please try again later."); }
  const suppliedPhone = phoneInput.replace(/\s+/g, "");

  return prisma.$transaction(async (tx) => {
    const deposit = await tx.walletDeposit.findFirst({ where: { id: depositId, userId: user.id }, select: { id: true, walletId: true, amount: true, currency: true, status: true, reference: true } });
    if (!deposit) return invalid("Deposit not found.");
    if (deposit.status !== WalletDepositStatus.PENDING) return invalid("Only a pending deposit can be paid.");
    if (deposit.currency !== "INR") return invalid("This deposit uses an unsupported currency.");

    const phone = user.phone || suppliedPhone;
    if (!PHONE_PATTERN.test(phone)) return invalid("A valid 10-digit Indian mobile number is required for PayU checkout.");
    if (!user.phone) await tx.user.update({ where: { id: user.id }, data: { phone } });

    const amount = deposit.amount.toFixed(2);
    const fieldsWithoutHash = { key: config.merchantKey, txnid: deposit.reference, amount, productinfo: productInfo(deposit.reference), firstname: firstNameFromUser(user.name), email: user.email, phone, udf1: "", udf2: "", udf3: "", udf4: "", udf5: "", surl: callbackUrl, furl: callbackUrl };
    const hash = generatePayURequestHash({ ...fieldsWithoutHash, salt: config.merchantSalt });
    return { ok: true, depositId: deposit.id, reference: deposit.reference, checkoutUrl: config.checkoutUrl, fields: { ...fieldsWithoutHash, hash } } satisfies WalletDepositPaymentResult;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function responseValue(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function expectedCallbackFields(response: PayUResponseFields, deposit: { amount: Prisma.Decimal; reference: string }) {
  return response.txnid === deposit.reference && normalizePaymentAmount(response.amount) === deposit.amount.toFixed(2) && response.productinfo === productInfo(deposit.reference);
}

async function applyVerifiedWalletDeposit(verification: PayUVerificationResult, merchantTransactionId: string, response: PayUResponseFields): Promise<WalletDepositVerificationResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "WalletDeposit" WHERE "reference" = ${merchantTransactionId} FOR UPDATE`);
    if (locked.length === 0) return { outcome: "REJECTED", depositId: null, message: safeMessage("REJECTED") };

    const deposit = await tx.walletDeposit.findUnique({ where: { reference: merchantTransactionId }, select: { id: true, userId: true, walletId: true, amount: true, currency: true, status: true, reference: true, providerReference: true } });
    if (!deposit) return { outcome: "REJECTED", depositId: null, message: safeMessage("REJECTED") };
    if (deposit.currency !== "INR" || !expectedCallbackFields(response, deposit)) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };

    const providerTransactionId = verification.transaction?.mihpayid || null;
    if (deposit.providerReference && providerTransactionId && deposit.providerReference !== providerTransactionId) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };

    if (verification.state === "SUCCESS") {
      if (deposit.status === WalletDepositStatus.SUCCESS) return { outcome: "SUCCESS", depositId: deposit.id, message: safeMessage("SUCCESS") };
      if (deposit.status !== WalletDepositStatus.PENDING) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
      if (!providerTransactionId) return { outcome: "PENDING", depositId: deposit.id, message: safeMessage("PENDING") };

      await creditVerifiedDepositInTransaction(tx, { walletId: deposit.walletId, amount: deposit.amount.toFixed(2), currency: deposit.currency, depositReference: deposit.reference });
      await tx.walletDeposit.update({ where: { id: deposit.id }, data: { status: WalletDepositStatus.SUCCESS, providerReference: providerTransactionId } });
      return { outcome: "SUCCESS", depositId: deposit.id, message: safeMessage("SUCCESS") };
    }

    if (verification.state === "FAILED") {
      if (deposit.status === WalletDepositStatus.SUCCESS) return { outcome: "SUCCESS", depositId: deposit.id, message: safeMessage("SUCCESS") };
      if (deposit.status === WalletDepositStatus.FAILED) return { outcome: "FAILED", depositId: deposit.id, message: safeMessage("FAILED") };
      if (deposit.status !== WalletDepositStatus.PENDING) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
      await tx.walletDeposit.update({ where: { id: deposit.id }, data: { status: WalletDepositStatus.FAILED, providerReference: providerTransactionId ?? undefined } });
      return { outcome: "FAILED", depositId: deposit.id, message: safeMessage("FAILED") };
    }

    if (deposit.status === WalletDepositStatus.SUCCESS) return { outcome: "SUCCESS", depositId: deposit.id, message: safeMessage("SUCCESS") };
    if (deposit.status !== WalletDepositStatus.PENDING) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
    if (providerTransactionId) await tx.walletDeposit.update({ where: { id: deposit.id }, data: { providerReference: providerTransactionId } });
    return { outcome: "PENDING", depositId: deposit.id, message: safeMessage("PENDING") };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function verifyAndFinalizePayUWalletDeposit(response: PayUResponseFields): Promise<WalletDepositVerificationResult> {
  const txnid = response.txnid?.trim() ?? "";
  if (!DEPOSIT_REFERENCE_PATTERN.test(txnid)) return { outcome: "REJECTED", depositId: null, message: safeMessage("REJECTED") };
  if (!response.key || !response.amount || !response.productinfo || !response.firstname || !response.email || !response.status || !response.hash) return { outcome: "REJECTED", depositId: null, message: safeMessage("REJECTED") };

  try {
    const config = getPayUConfig();
    if (response.key !== config.merchantKey) return { outcome: "REJECTED", depositId: null, message: safeMessage("REJECTED") };

    const deposit = await prisma.walletDeposit.findUnique({ where: { reference: txnid }, select: { id: true, amount: true, currency: true, reference: true, user: { select: { name: true, email: true, phone: true } } } });
    if (!deposit || deposit.currency !== "INR") return { outcome: "REJECTED", depositId: deposit?.id ?? null, message: safeMessage("REJECTED") };
    if (!expectedCallbackFields(response, deposit)) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
    if (response.firstname !== firstNameFromUser(deposit.user.name) || response.email !== deposit.user.email) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
    if (deposit.user.phone && response.phone && response.phone !== deposit.user.phone) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
    if (!validatePayUResponseHash(response, config.merchantSalt)) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };

    const verification = await verifyPayUTransaction(txnid);
    if (verification.state === "UNKNOWN") return { outcome: "PENDING", depositId: deposit.id, message: safeMessage("PENDING") };
    if (!verification.transaction || verification.transaction.txnid !== txnid || normalizePaymentAmount(verification.transaction.amount) !== deposit.amount.toFixed(2) || (verification.transaction.transactionAmount !== null && normalizePaymentAmount(verification.transaction.transactionAmount) !== deposit.amount.toFixed(2))) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
    if (verification.transaction.productinfo !== null && verification.transaction.productinfo !== productInfo(deposit.reference)) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
    if (verification.transaction.email !== null && verification.transaction.email !== deposit.user.email) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };
    if (verification.transaction.firstname !== null && verification.transaction.firstname !== firstNameFromUser(deposit.user.name)) return { outcome: "REJECTED", depositId: deposit.id, message: safeMessage("REJECTED") };

    return applyVerifiedWalletDeposit(verification, txnid, response);
  } catch (error) {
    console.error("PayU wallet deposit verification failed", { merchantTransactionId: txnid, error: error instanceof Error ? error.name : "unknown" });
    return { outcome: "PENDING", depositId: null, message: safeMessage("PENDING") };
  }
}

export function parsePayUWalletCallback(data: Record<string, unknown>): PayUResponseFields {
  const get = (name: string) => responseValue(data[name]);
  return { key: get("key"), txnid: get("txnid"), amount: get("amount"), productinfo: get("productinfo"), firstname: get("firstname"), email: get("email"), phone: get("phone"), udf1: get("udf1"), udf2: get("udf2"), udf3: get("udf3"), udf4: get("udf4"), udf5: get("udf5"), status: get("status").toLowerCase(), hash: get("hash"), mihpayid: get("mihpayid") };
}
