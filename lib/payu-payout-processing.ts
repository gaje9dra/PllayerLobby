import "server-only";

import crypto from "node:crypto";
import { Prisma, PayoutPaymentType, PayoutStatus, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBeneficiary, getTransferStatus, initiateTransfer, validateVPA } from "@/lib/payu-payout-client";
import { decryptPayoutData } from "@/lib/payout-crypto";
import { validatePayoutDestinationInput } from "@/lib/payout-destination-validation";
import { compareMoney, normalizeMoney } from "@/lib/wallet-rules";

const PROVIDER = "PAYU";
const ACTIVE = [PayoutStatus.PAYOUT_INITIATED, PayoutStatus.PROCESSING] as const;

type DestinationSnapshot =
  | { type: "UPI"; displayName: string; upiId: string }
  | { type: "BANK_ACCOUNT"; displayName: string; accountNumber: string; ifsc: string; accountHolderName: string; bankName: string };

function safeMessage(value: unknown) { return String(value ?? "Provider request failed").replace(/[\r\n]+/g, " ").slice(0, 300); }
function newMerchantRef() { return `PL${crypto.randomBytes(10).toString("hex")}${Date.now().toString(36)}`.slice(0, 40); }

function readSnapshot(encrypted: string, type: "UPI" | "BANK_ACCOUNT"): DestinationSnapshot {
  let raw: unknown;
  try { raw = JSON.parse(decryptPayoutData(encrypted)); } catch { throw new Error("DESTINATION_DATA_CORRUPTED"); }
  if (!raw || typeof raw !== "object") throw new Error("DESTINATION_DATA_CORRUPTED");
  const value = raw as Record<string, unknown>;
  const input = type === "UPI"
    ? { type: "UPI" as const, displayName: String(value.displayName ?? ""), upiId: String(value.upiId ?? "") }
    : { type: "BANK_ACCOUNT" as const, displayName: String(value.displayName ?? ""), accountNumber: String(value.accountNumber ?? ""), ifsc: String(value.ifsc ?? ""), accountHolderName: String(value.accountHolderName ?? ""), bankName: String(value.bankName ?? "") };
  const result = validatePayoutDestinationInput(input);
  if (!result) throw new Error("DESTINATION_DATA_CORRUPTED");
  if (result.data.type === "UPI") return { type: "UPI", displayName: result.displayName, upiId: result.data.upiId };
  return { type: "BANK_ACCOUNT", displayName: result.displayName, accountNumber: result.data.accountNumber, ifsc: result.data.ifsc, accountHolderName: result.data.accountHolderName, bankName: result.data.bankName };
}

function paymentTypeFor(destinationType: "UPI" | "BANK_ACCOUNT", value: string): PayoutPaymentType {
  if (!["UPI", "IMPS", "NEFT", "RTGS"].includes(value)) throw new Error("INVALID_PAYMENT_TYPE");
  if (destinationType === "UPI" && value !== "UPI") throw new Error("UPI_REQUIRES_UPI_PAYMENT_TYPE");
  if (destinationType === "BANK_ACCOUNT" && value === "UPI") throw new Error("BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE");
  return value as PayoutPaymentType;
}
export const validatePaymentType = paymentTypeFor;

function transferFields(snapshot: DestinationSnapshot) {
  if (snapshot.type === "UPI") return { vpa: snapshot.upiId, accountNumber: undefined, ifsc: undefined, beneficiaryName: snapshot.displayName };
  return { vpa: undefined, accountNumber: snapshot.accountNumber, ifsc: snapshot.ifsc, beneficiaryName: snapshot.accountHolderName || snapshot.displayName };
}

async function ensureBeneficiary(destinationId: string, snapshot: DestinationSnapshot, user: { name: string | null; email: string; phone: string | null }) {
  const existing = await prisma.payoutBeneficiary.findUnique({ where: { payoutDestinationId_provider: { payoutDestinationId: destinationId, provider: PROVIDER } } });
  if (existing?.status === "ACTIVE") return existing;
  if (existing?.status === "PENDING") throw new Error("BENEFICIARY_CREATION_IN_PROGRESS");
  const fields = transferFields(snapshot);
  const response = await createBeneficiary({ name: fields.beneficiaryName || user.name || "Player", email: user.email, mobile: user.phone || undefined, accountNo: fields.accountNumber, ifsc: fields.ifsc, vpa: fields.vpa });
  const root = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const providerId = String(data.beneficiaryId ?? "");
  if (Number(root.status ?? 1) !== 0 || !providerId) throw new Error("PAYU_BENEFICIARY_CREATION_FAILED");
  return prisma.payoutBeneficiary.upsert({ where: { payoutDestinationId_provider: { payoutDestinationId: destinationId, provider: PROVIDER } }, update: { providerBeneficiaryId: providerId, status: "ACTIVE" }, create: { payoutDestinationId: destinationId, provider: PROVIDER, providerBeneficiaryId: providerId, status: "ACTIVE" } });
}

async function preparePayout(withdrawalId: string, paymentType: PayoutPaymentType, retry: boolean) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { id: true, userId: true, walletId: true, payoutDestinationId: true, destinationTypeSnapshot: true, destinationMaskedSnapshot: true, encryptedDestinationSnapshot: true, amount: true, currency: true, status: true } });
    if (!request) throw new Error("WITHDRAWAL_NOT_FOUND");
    if (!request.payoutDestinationId || !request.destinationTypeSnapshot || !request.destinationMaskedSnapshot || !request.encryptedDestinationSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");
    if (request.status !== (retry ? WithdrawalRequestStatus.FAILED : WithdrawalRequestStatus.APPROVED)) throw new Error(retry ? "PAYOUT_RETRY_NOT_ALLOWED" : "WITHDRAWAL_NOT_APPROVED");
    if (request.currency !== "INR") throw new Error("CURRENCY_MISMATCH");
    const destination = await tx.payoutDestination.findUnique({ where: { id: request.payoutDestinationId }, select: { id: true, userId: true, type: true, status: true, maskedDestination: true } });
    if (!destination || destination.userId !== request.userId || destination.type !== request.destinationTypeSnapshot) throw new Error("DESTINATION_OWNERSHIP_MISMATCH");
    if (destination.status === "DISABLED") throw new Error("DESTINATION_DISABLED");
    if (destination.status !== "VERIFIED") throw new Error("DESTINATION_NOT_VERIFIED");
    if (destination.maskedDestination !== request.destinationMaskedSnapshot) throw new Error("DESTINATION_SNAPSHOT_MISMATCH");
    const active = await tx.payout.findFirst({ where: { withdrawalRequestId: request.id, status: { in: [...ACTIVE] } }, select: { id: true } });
    if (active) throw new Error("PAYOUT_ALREADY_ACTIVE");
    const payout = await tx.payout.create({ data: { withdrawalRequestId: request.id, provider: PROVIDER, merchantTransferId: newMerchantRef(), amount: request.amount, currency: request.currency, paymentType, status: PayoutStatus.PAYOUT_INITIATED, initiatedAt: new Date() } });
    await tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.PAYOUT_INITIATED } });
    return { payout, request };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function setFailed(payoutId: string, withdrawalId: string, code: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { status: true } });
    if (!payout || payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REVERSED) return;
    await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.FAILED, failureCode: code.slice(0, 128), failureReason: reason.slice(0, 1000) } });
    await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.FAILED, rejectionReason: reason.slice(0, 1000) } });
  });
}

async function sendPrepared(prepared: Awaited<ReturnType<typeof preparePayout>>, retry: boolean) {
  const user = await prisma.user.findUnique({ where: { id: prepared.request.userId }, select: { name: true, email: true, phone: true, status: true } });
  if (!user || user.status !== "ACTIVE") throw new Error("USER_NOT_ACTIVE");
  const snapshot = readSnapshot(prepared.request.encryptedDestinationSnapshot!, prepared.request.destinationTypeSnapshot!);
  const fields = transferFields(snapshot);
  try {
    if (prepared.payout.paymentType === PayoutPaymentType.UPI) {
      const validation = await validateVPA(fields.vpa!);
      if (!validation || typeof validation !== "object" || Number((validation as Record<string, unknown>).status ?? 1) !== 0) {
        await setFailed(prepared.payout.id, prepared.request.id, "PAYU_VPA_INVALID", "PayU could not validate the payout VPA.");
        throw new Error("PAYU_VPA_VALIDATION_FAILED");
      }
    }
    await ensureBeneficiary(prepared.request.payoutDestinationId!, snapshot, user);
    const response = await initiateTransfer({ beneficiaryName: fields.beneficiaryName || user.name || "Player", beneficiaryEmail: user.email, beneficiaryMobile: user.phone || undefined, accountNumber: fields.accountNumber, ifsc: fields.ifsc, vpa: fields.vpa, purpose: retry ? "PlayerLobby withdrawal retry" : "PlayerLobby withdrawal", amount: Number(normalizeMoney(prepared.request.amount.toString())!), batchId: prepared.payout.id, merchantRefId: prepared.payout.merchantTransferId, paymentType: prepared.payout.paymentType, retry });
    const root = response && typeof response === "object" ? response as Record<string, unknown> : {};
    const status = Number(root.status ?? -1);
    if (status === 0) {
      return prisma.$transaction(async (tx) => {
        const payout = await tx.payout.update({ where: { id: prepared.payout.id }, data: { status: PayoutStatus.PROCESSING }, select: { id: true, status: true, merchantTransferId: true, amount: true, currency: true, paymentType: true } });
        await tx.withdrawalRequest.update({ where: { id: prepared.request.id }, data: { status: WithdrawalRequestStatus.PROCESSING } });
        return payout;
      });
    }
    if (status === 1) {
      const data = Array.isArray(root.data) ? root.data[0] : root.data;
      const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
      const reason = safeMessage(row.error ?? root.msg ?? "PayU rejected the transfer request.");
      await setFailed(prepared.payout.id, prepared.request.id, String(row.code ?? "PAYU_TRANSFER_REJECTED"), reason);
      throw new Error("PAYU_TRANSFER_REJECTED");
    }
    throw new Error("PAYU_TRANSFER_UNCERTAIN");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["PAYU_VPA_VALIDATION_FAILED", "PAYU_TRANSFER_REJECTED", "PAYU_TRANSFER_UNCERTAIN", "BENEFICIARY_CREATION_IN_PROGRESS", "PAYU_BENEFICIARY_CREATION_FAILED"].includes(code)) throw error;
    throw new Error("PAYU_TRANSFER_UNCERTAIN");
  }
}

export async function initiateWithdrawalPayout(withdrawalId: string, paymentTypeInput: string) {
  await requireAdmin();
  const request = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { destinationTypeSnapshot: true } });
  if (!request?.destinationTypeSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");
  return sendPrepared(await preparePayout(withdrawalId, paymentTypeFor(request.destinationTypeSnapshot, paymentTypeInput), false), false);
}

export async function retryFailedWithdrawalPayout(withdrawalId: string, paymentTypeInput: string) {
  await requireAdmin();
  const request = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { destinationTypeSnapshot: true } });
  if (!request?.destinationTypeSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");
  return sendPrepared(await preparePayout(withdrawalId, paymentTypeFor(request.destinationTypeSnapshot, paymentTypeInput), true), true);
}

function providerResult(response: unknown, merchantRefId: string, expectedAmount: string, expectedCurrency: string) {
  const root = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const rows = Array.isArray(data.transactionDetails) ? data.transactionDetails : [];
  const row = rows.find((item) => item && typeof item === "object" && String((item as Record<string, unknown>).merchantRefId ?? "") === merchantRefId) as Record<string, unknown> | undefined;
  if (!row) return { state: "UNKNOWN" as const };
  const providerAmount = row.amount === undefined ? null : String(row.amount);
  if (providerAmount !== null && compareMoney(providerAmount, expectedAmount) !== 0) return { state: "MISMATCH" as const };
  if (expectedCurrency !== "INR") return { state: "MISMATCH" as const };
  const status = String(row.txnStatus ?? "").toUpperCase();
  const ref = String(row.payuTransactionRefNo ?? "");
  const bankRef = String(row.bankTransactionRefNo ?? "");
  if (status === "SUCCESS") return { state: "SUCCESS" as const, providerReference: ref, bankReference: bankRef };
  if (status === "FAILED") return { state: "FAILED" as const, providerReference: ref, message: safeMessage(row.msg ?? row.txnStatusDescription) };
  return { state: "PROCESSING" as const, providerReference: ref };
}

export async function reconcilePayUPayout(payoutId: string) {
  await requireAdmin();
  const payout = await prisma.payout.findUnique({ where: { id: payoutId }, include: { withdrawalRequest: { select: { id: true, amount: true, currency: true, status: true } } } });
  if (!payout) throw new Error("PAYOUT_NOT_FOUND");
  const response = await getTransferStatus(payout.merchantTransferId);
  const provider = providerResult(response, payout.merchantTransferId, payout.amount.toString(), payout.currency);
  if (provider.state === "MISMATCH") return { payoutId, localStatus: payout.status, providerStatus: "MISMATCH" as const, providerReference: null };
  if (provider.state === "SUCCESS") {
    if (payout.status === PayoutStatus.FAILED || payout.status === PayoutStatus.REVERSED) return { payoutId, localStatus: payout.status, providerStatus: "SUCCESS" as const, providerReference: provider.providerReference ?? null, discrepancy: "LOCAL_FINAL_FAILURE_CONFLICTS_WITH_PROVIDER_SUCCESS" };
    await finalizeSuccess(payout.id, payout.withdrawalRequestId, provider.providerReference, provider.bankReference);
  } else if (provider.state === "FAILED") {
    if (payout.status === PayoutStatus.PAID) return { payoutId, localStatus: payout.status, providerStatus: "FAILED" as const, providerReference: provider.providerReference ?? null, discrepancy: "LOCAL_PAID_CONFLICTS_WITH_PROVIDER_FAILURE" };
    await finalizeFailure(payout.id, payout.withdrawalRequestId, provider.providerReference, provider.message);
  }
  return { payoutId, localStatus: payout.status, providerStatus: provider.state, providerReference: provider.providerReference ?? null };
}

async function finalizeSuccess(payoutId: string, withdrawalId: string, providerReference?: string, bankReference?: string) {
  await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { id: true, status: true, withdrawalRequestId: true, amount: true, currency: true } });
    if (!payout || payout.withdrawalRequestId !== withdrawalId) throw new Error("PAYOUT_NOT_FOUND");
    if (payout.status === PayoutStatus.PAID) return;
    if (payout.status === PayoutStatus.FAILED || payout.status === PayoutStatus.REVERSED) throw new Error("PAYOUT_STATE_CONFLICT");
    const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { id: true, walletId: true, amount: true, currency: true, status: true } });
    if (!request || request.status === WithdrawalRequestStatus.PAID || request.status === WithdrawalRequestStatus.FAILED || request.status === WithdrawalRequestStatus.REVERSED) throw new Error("PAYOUT_STATE_CONFLICT");
    if (request.currency !== payout.currency || compareMoney(request.amount.toString(), payout.amount.toString()) !== 0) throw new Error("PAYOUT_AMOUNT_MISMATCH");
    const walletRows = await tx.$queryRaw<Array<{ id: string; currency: string; balance: string }>>(Prisma.sql`SELECT "id", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${request.walletId}::uuid FOR UPDATE`);
    const wallet = walletRows[0];
    if (!wallet || wallet.currency !== request.currency) throw new Error("WALLET_INTEGRITY_ERROR");
    if (compareMoney(wallet.balance, payout.amount.toString()) < 0) throw new Error("INSUFFICIENT_WALLET_BALANCE");
    const existing = await tx.walletTransaction.findFirst({ where: { walletId: request.walletId, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, type: "DEBIT", category: "WITHDRAWAL" }, select: { id: true, amount: true, currency: true } });
    if (!existing) {
      const cents = BigInt(wallet.balance.replace(".", "")) - BigInt(payout.amount.toString().replace(".", ""));
      const next = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
      await tx.walletTransaction.create({ data: { walletId: request.walletId, type: "DEBIT", category: "WITHDRAWAL", amount: payout.amount, currency: request.currency, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, description: "Successful PayU payout" } });
      await tx.wallet.update({ where: { id: request.walletId }, data: { balance: next } });
    } else if (existing.amount.toString() !== payout.amount.toString() || existing.currency !== payout.currency) throw new Error("PAYOUT_LEDGER_TERM_MISMATCH");
    await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PAID, providerTransferId: providerReference || undefined, providerReference: bankReference || providerReference || undefined, completedAt: new Date() } });
    await tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.PAID } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function finalizeFailure(payoutId: string, withdrawalId: string, providerReference?: string, message?: string) {
  await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { status: true } });
    if (!payout || payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REVERSED) return;
    await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.FAILED, providerTransferId: providerReference || undefined, providerReference: providerReference || undefined, failureCode: "PAYU_TRANSFER_FAILED", failureReason: safeMessage(message || "PayU reported a definitive transfer failure.") } });
    await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.FAILED, rejectionReason: safeMessage(message || "PayU reported a definitive transfer failure.") } });
  });
}

export async function handlePayUPayoutWebhook(event: { event: string; merchantReferenceId?: string; payuRefId?: string; bankReferenceId?: string; payoutMerchantId?: string; msg?: string; authorization?: string }) {
  const { getPayUPayoutConfig } = await import("@/lib/payu-payout-client");
  const config = getPayUPayoutConfig();
  if (event.authorization !== config.webhookSecret) throw new Error("INVALID_WEBHOOK_AUTHORIZATION");
  if (event.payoutMerchantId !== config.merchantId) throw new Error("INVALID_PAYOUT_MERCHANT_ID");
  if (!event.merchantReferenceId) throw new Error("MISSING_MERCHANT_REFERENCE");
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ event: event.event, merchantReferenceId: event.merchantReferenceId, payuRefId: event.payuRefId ?? null, bankReferenceId: event.bankReferenceId ?? null, payoutMerchantId: event.payoutMerchantId, msg: event.msg ?? null })).digest("hex");
  try {
    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.payoutWebhookEvent.findUnique({ where: { fingerprint }, select: { id: true } });
      if (duplicate) return { duplicate: true as const };
      const payout = await tx.payout.findUnique({ where: { merchantTransferId: event.merchantReferenceId! }, select: { id: true, withdrawalRequestId: true } });
      await tx.payoutWebhookEvent.create({ data: { provider: PROVIDER, eventType: event.event, merchantTransferId: event.merchantReferenceId, providerReference: event.payuRefId || event.bankReferenceId || null, fingerprint, payoutId: payout?.id } });
      if (!payout) return { unknown: true as const };
      if (event.event === "TRANSFER_SUCCESS") return { action: "SUCCESS" as const, payoutId: payout.id, withdrawalId: payout.withdrawalRequestId, providerReference: event.payuRefId, bankReference: event.bankReferenceId };
      if (event.event === "TRANSFER_FAILED") return { action: "FAILED" as const, payoutId: payout.id, withdrawalId: payout.withdrawalRequestId, providerReference: event.payuRefId, message: event.msg };
      if (event.event === "TRANSFER_REVERSED") return { action: "REVERSED" as const, payoutId: payout.id, withdrawalId: payout.withdrawalRequestId, providerReference: event.payuRefId, bankReference: event.bankReferenceId };
      return { action: "IGNORED" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ("duplicate" in result && result.duplicate) return result;
    if ("unknown" in result && result.unknown) return result;
    if (result.action === "SUCCESS") await finalizeSuccess(result.payoutId, result.withdrawalId, result.providerReference, result.bankReference);
    else if (result.action === "FAILED") await finalizeFailure(result.payoutId, result.withdrawalId, result.providerReference, result.message);
    else if (result.action === "REVERSED") await prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({ where: { id: result.payoutId }, select: { status: true } });
      if (!payout || payout.status === PayoutStatus.REVERSED) return;
      if (payout.status === PayoutStatus.FAILED) throw new Error("PAYOUT_STATE_CONFLICT");
      await tx.payout.update({ where: { id: result.payoutId }, data: { status: PayoutStatus.REVERSED, providerTransferId: result.providerReference || undefined, providerReference: result.bankReference || result.providerReference || undefined } });
      await tx.withdrawalRequest.update({ where: { id: result.withdrawalId }, data: { status: WithdrawalRequestStatus.REVERSED } });
    });
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) return { duplicate: true };
    throw error;
  }
}

export function formatPayoutError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    PAYU_PAYOUT_ENVIRONMENT_INVALID: "PayU payout environment is invalid.", PAYU_PAYOUT_PRODUCTION_DISABLED: "Production payouts are disabled by the safety switch.", PAYU_AUTH_FAILED: "PayU payout authentication failed.", WITHDRAWAL_NOT_APPROVED: "The withdrawal must be approved before payout processing.", PAYOUT_ALREADY_ACTIVE: "A payout is already processing for this withdrawal.", PAYOUT_RETRY_NOT_ALLOWED: "Retry is allowed only after a definitive PayU failure.",
    DESTINATION_NOT_VERIFIED: "The payout destination must be verified before processing.", DESTINATION_DISABLED: "The payout destination is disabled.", DESTINATION_SNAPSHOT_MISMATCH: "The payout destination no longer matches the approved withdrawal snapshot.", PAYU_VPA_VALIDATION_FAILED: "PayU could not validate the UPI VPA.", PAYU_BENEFICIARY_CREATION_FAILED: "PayU beneficiary registration failed.", BENEFICIARY_CREATION_IN_PROGRESS: "PayU beneficiary registration is still being reconciled.", PAYU_TRANSFER_REJECTED: "PayU rejected the payout request.", PAYU_TRANSFER_UNCERTAIN: "PayU did not provide a definitive result. Check PayU status before retrying.", PAYU_TRANSFER_HTTP_ERROR: "PayU rejected the payout request.", INVALID_PAYMENT_TYPE: "Invalid payout payment type.", UPI_REQUIRES_UPI_PAYMENT_TYPE: "UPI destinations require UPI payout processing.", BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE: "Bank destinations require IMPS, NEFT, or RTGS.", PAYOUT_AMOUNT_MISMATCH: "The payout amount does not match the withdrawal.", WALLET_INTEGRITY_ERROR: "Wallet integrity validation failed.", INSUFFICIENT_WALLET_BALANCE: "The wallet balance is insufficient for the payout.", PAYOUT_STATE_CONFLICT: "The provider result conflicts with an existing final financial state and requires reconciliation." };
  return messages[code] ?? "Payout processing could not be completed.";
}
