import "server-only";

import { createHash } from "node:crypto";
import { Prisma, PayoutBeneficiaryStatus, PayoutDestinationStatus, PayoutPaymentType, PayoutStatus, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { decryptPayoutData } from "@/lib/payout-crypto";
import { prisma } from "@/lib/prisma";
import { createPayUBeneficiary, getPayUPayoutConfig, getPayUTransferStatus, initiatePayUTransfer, validatePayUVpa, type PayUPaymentType } from "@/lib/payu-payout-client";
import { compareMoney } from "@/lib/wallet-rules";
import { recordSuccessfulWithdrawalDebit } from "@/lib/withdrawal-payout-ledger";

const PROVIDER = "PAYU";
const DEFAULT_BANK_PAYMENT_TYPE: PayUPaymentType = "IMPS";

function merchantReference() {
  return `PL${Date.now().toString(36).toUpperCase()}${cryptoRandom(10)}`.slice(0, 40);
}

function cryptoRandom(length: number) {
  return createHash("sha256").update(`${Date.now()}-${Math.random()}-${process.pid}`).digest("hex").slice(0, length).toUpperCase();
}

function safeProviderMessage(value: unknown) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").slice(0, 1000) : null;
}

function parseSnapshot(raw: string, type: "UPI" | "BANK_ACCOUNT") {
  let value: unknown;
  try { value = JSON.parse(decryptPayoutData(raw)); } catch { throw new Error("DESTINATION_DATA_CORRUPTED"); }
  if (!value || typeof value !== "object") throw new Error("DESTINATION_DATA_CORRUPTED");
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || record.type !== type) throw new Error("DESTINATION_DATA_CORRUPTED");
  if (type === "UPI" && typeof record.upiId !== "string") throw new Error("DESTINATION_DATA_CORRUPTED");
  if (type === "BANK_ACCOUNT" && ["accountHolderName", "accountNumber", "ifsc", "bankName"].some((key) => typeof record[key] !== "string")) throw new Error("DESTINATION_DATA_CORRUPTED");
  return record;
}

async function lockWithdrawal(tx: Prisma.TransactionClient, withdrawalId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; userId: string; walletId: string; payoutDestinationId: string | null; destinationTypeSnapshot: "UPI" | "BANK_ACCOUNT" | null; destinationMaskedSnapshot: string | null; encryptedDestinationSnapshot: string | null; amount: string; currency: string; status: WithdrawalRequestStatus }>>(Prisma.sql`SELECT "id","userId","walletId","payoutDestinationId","destinationTypeSnapshot","destinationMaskedSnapshot","encryptedDestinationSnapshot","amount"::text AS "amount","currency","status" FROM "WithdrawalRequest" WHERE "id" = ${withdrawalId}::uuid FOR UPDATE`);
  if (!rows[0]) throw new Error("WITHDRAWAL_NOT_FOUND");
  return rows[0];
}

async function ensureBeneficiary(input: { destinationId: string; type: "UPI" | "BANK_ACCOUNT"; data: Record<string, unknown>; name: string; email: string; mobile?: string }) {
  const existing = await prisma.payoutBeneficiary.findUnique({ where: { payoutDestinationId_provider: { payoutDestinationId: input.destinationId, provider: PROVIDER } } });
  if (existing?.status === PayoutBeneficiaryStatus.ACTIVE && existing.providerBeneficiaryId) return existing;
  if (existing?.status === PayoutBeneficiaryStatus.PENDING) throw new Error("BENEFICIARY_CREATION_IN_PROGRESS");

  const providerInput = input.type === "UPI"
    ? { name: input.name, email: input.email || undefined, mobile: input.mobile, vpa: String(input.data.upiId) }
    : { name: input.name, email: input.email || undefined, mobile: input.mobile, accountNo: String(input.data.accountNumber), ifsc: String(input.data.ifsc) };

  const response = await createPayUBeneficiary(providerInput);
  const data = response && typeof response === "object" && "data" in response ? (response as { data?: unknown }).data : null;
  const beneficiaryId = data && typeof data === "object" && "beneficiaryId" in data ? String((data as { beneficiaryId: unknown }).beneficiaryId) : "";
  const status = response && typeof response === "object" && "status" in response ? Number((response as { status: unknown }).status) : 1;
  if (status !== 0 || !beneficiaryId) throw new Error("PAYU_BENEFICIARY_CREATION_FAILED");

  try {
    return await prisma.payoutBeneficiary.create({ data: { payoutDestinationId: input.destinationId, provider: PROVIDER, providerBeneficiaryId: beneficiaryId, status: PayoutBeneficiaryStatus.ACTIVE } });
  } catch {
    const concurrent = await prisma.payoutBeneficiary.findUnique({ where: { payoutDestinationId_provider: { payoutDestinationId: input.destinationId, provider: PROVIDER } } });
    if (concurrent?.providerBeneficiaryId) return concurrent;
    throw new Error("BENEFICIARY_MAPPING_FAILED");
  }
}

async function updateFailedPayout(payoutId: string, withdrawalId: string, code: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { id: true, status: true } });
    if (!payout) throw new Error("PAYOUT_NOT_FOUND");
    if (payout.status === PayoutStatus.PAID) return payout;
    await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.FAILED, failureCode: code.slice(0, 128), failureReason: reason.slice(0, 1000), completedAt: new Date() } });
    await tx.withdrawalRequest.updateMany({ where: { id: withdrawalId, status: { in: [WithdrawalRequestStatus.PAYOUT_INITIATED, WithdrawalRequestStatus.PROCESSING] } }, data: { status: WithdrawalRequestStatus.FAILED } });
    return payout;
  });
}

export async function initiateWithdrawalPayout(withdrawalId: string, requestedPaymentType?: string) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(withdrawalId)) throw new Error("WITHDRAWAL_NOT_FOUND");
  const paymentType = requestedPaymentType?.toUpperCase() as PayUPaymentType | undefined;

  const prepared = await prisma.$transaction(async (tx) => {
    const withdrawal = await lockWithdrawal(tx, withdrawalId);
    if (withdrawal.status !== WithdrawalRequestStatus.APPROVED) throw new Error("WITHDRAWAL_NOT_APPROVED");
    if (!withdrawal.payoutDestinationId || !withdrawal.destinationTypeSnapshot || !withdrawal.destinationMaskedSnapshot || !withdrawal.encryptedDestinationSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");
    const destination = await tx.payoutDestination.findUnique({ where: { id: withdrawal.payoutDestinationId }, select: { id: true, userId: true, type: true, status: true, maskedDestination: true } });
    if (!destination || destination.userId !== withdrawal.userId) throw new Error("DESTINATION_OWNERSHIP_MISMATCH");
    if (destination.status !== PayoutDestinationStatus.VERIFIED) throw new Error("DESTINATION_NOT_VERIFIED");
    if (destination.type !== withdrawal.destinationTypeSnapshot || destination.maskedDestination !== withdrawal.destinationMaskedSnapshot) throw new Error("DESTINATION_SNAPSHOT_MISMATCH");
    const existing = await tx.payout.findFirst({ where: { withdrawalRequestId: withdrawal.id, status: { in: [PayoutStatus.PAYOUT_INITIATED, PayoutStatus.PROCESSING] } }, select: { id: true, merchantTransferId: true, status: true } });
    if (existing) throw new Error("PAYOUT_ALREADY_ACTIVE");
    const walletRows = await tx.$queryRaw<Array<{ userId: string; currency: string; balance: string }>>(Prisma.sql`SELECT "userId","currency","balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${withdrawal.walletId}::uuid FOR UPDATE`);
    const wallet = walletRows[0];
    if (!wallet || wallet.userId !== withdrawal.userId || wallet.currency !== withdrawal.currency) throw new Error("WITHDRAWAL_INTEGRITY_ERROR");
    const reservedRows = await tx.$queryRaw<Array<{ amount: string }>>(Prisma.sql`SELECT COALESCE(SUM("amount"),0)::text AS "amount" FROM "WithdrawalRequest" WHERE "walletId" = ${withdrawal.walletId}::uuid AND "status" IN ('PENDING','APPROVED') AND "id" <> ${withdrawal.id}::uuid`);
    const reserved = reservedRows[0]?.amount ?? "0.00";
    const available = Number(wallet.balance) - Number(reserved);
    if (!Number.isFinite(available) || Number(withdrawal.amount) > available + 0.000001) throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");
    const merchantTransferId = merchantReference();
    const payoutType: PayoutPaymentType = withdrawal.destinationTypeSnapshot === "UPI" ? "UPI" : paymentType ?? DEFAULT_BANK_PAYMENT_TYPE;
    if (!["UPI", "IMPS", "NEFT", "RTGS"].includes(payoutType)) throw new Error("INVALID_PAYMENT_TYPE");
    if (withdrawal.destinationTypeSnapshot === "UPI" && payoutType !== "UPI") throw new Error("UPI_REQUIRES_UPI_PAYMENT_TYPE");
    if (withdrawal.destinationTypeSnapshot === "BANK_ACCOUNT" && payoutType === "UPI") throw new Error("BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE");
    const payout = await tx.payout.create({ data: { withdrawalRequestId: withdrawal.id, provider: PROVIDER, merchantTransferId, amount: withdrawal.amount, currency: withdrawal.currency, paymentType: payoutType, status: PayoutStatus.PAYOUT_INITIATED, initiatedAt: new Date() } });
    await tx.withdrawalRequest.update({ where: { id: withdrawal.id }, data: { status: WithdrawalRequestStatus.PAYOUT_INITIATED } });
    return { payout, withdrawal, payoutType };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const user = await prisma.user.findUnique({ where: { id: prepared.withdrawal.userId }, select: { name: true, email: true, phone: true } });
  if (!user) throw new Error("USER_NOT_FOUND");
  const snapshot = parseSnapshot(prepared.withdrawal.encryptedDestinationSnapshot!, prepared.withdrawal.destinationTypeSnapshot!);

  try {
    if (prepared.payoutType === "UPI") {
      const validation = await validatePayUVpa(String(snapshot.upiId));
      const valid = validation && typeof validation === "object" && "status" in validation ? Number((validation as { status?: unknown }).status) === 0 : false;
      if (!valid) throw new Error("PAYU_VPA_VALIDATION_FAILED");
    }
    await ensureBeneficiary({ destinationId: prepared.withdrawal.payoutDestinationId!, type: prepared.withdrawal.destinationTypeSnapshot!, data: snapshot, name: user.name || snapshot.accountHolderName?.toString() || "Player", email: user.email, mobile: user.phone || undefined });
    const transfer = await initiatePayUTransfer({ beneficiaryName: user.name || String(snapshot.accountHolderName || "Player"), beneficiaryEmail: user.email, beneficiaryMobile: user.phone || undefined, beneficiaryAccountNumber: prepared.payoutType === "UPI" ? undefined : String(snapshot.accountNumber), beneficiaryIfscCode: prepared.payoutType === "UPI" ? undefined : String(snapshot.ifsc), vpa: prepared.payoutType === "UPI" ? String(snapshot.upiId) : undefined, purpose: "PlayerLobby withdrawal", amount: Number(prepared.withdrawal.amount.toFixed(2)), batchId: prepared.payout.id, merchantRefId: prepared.payout.merchantTransferId, paymentType: prepared.payoutType, retry: false });
    const providerStatus = transfer && typeof transfer === "object" && "status" in transfer ? Number((transfer as { status?: unknown }).status) : 1;
    const data = transfer && typeof transfer === "object" && "data" in transfer ? (transfer as { data?: unknown }).data : null;
    if (providerStatus !== 0) {
      const first = Array.isArray(data) ? data[0] : data;
      const code = first && typeof first === "object" && "code" in first ? String((first as { code?: unknown }).code ?? "PAYU_TRANSFER_REJECTED") : "PAYU_TRANSFER_REJECTED";
      const reason = first && typeof first === "object" && "error" in first ? safeProviderMessage((first as { error?: unknown }).error) : "PayU rejected the transfer request.";
      await updateFailedPayout(prepared.payout.id, prepared.withdrawal.id, code, reason || "PayU rejected the transfer request.");
      throw new Error("PAYU_TRANSFER_REJECTED");
    }
    await prisma.$transaction(async (tx) => {
      await tx.payout.update({ where: { id: prepared.payout.id }, data: { status: PayoutStatus.PROCESSING } });
      await tx.withdrawalRequest.update({ where: { id: prepared.withdrawal.id }, data: { status: WithdrawalRequestStatus.PROCESSING } });
    });
    return { payoutId: prepared.payout.id, merchantTransferId: prepared.payout.merchantTransferId, status: PayoutStatus.PROCESSING };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PAYU_TRANSFER_UNCERTAIN";
    if (["PAYU_VPA_VALIDATION_FAILED", "PAYU_BENEFICIARY_CREATION_FAILED", "BENEFICIARY_MAPPING_FAILED", "PAYU_TRANSFER_REJECTED"].includes(message)) throw error;
    // Network/timeout/5xx responses are intentionally left in PAYOUT_INITIATED so no second transfer can be sent blindly.
    throw new Error("PAYU_TRANSFER_UNCERTAIN");
  }
}

export async function reconcilePayUPayout(payoutId: string) {
  await requireAdmin();
  const payout = await prisma.payout.findUnique({ where: { id: payoutId }, select: { id: true, withdrawalRequestId: true, merchantTransferId: true, status: true, amount: true, currency: true } });
  if (!payout) throw new Error("PAYOUT_NOT_FOUND");
  const provider = await getPayUTransferStatus(payout.merchantTransferId);
  const data = provider && typeof provider === "object" && "data" in provider ? (provider as { data?: unknown }).data : null;
  const details = data && typeof data === "object" && "transactionDetails" in data ? (data as { transactionDetails?: unknown }).transactionDetails : [];
  const match = Array.isArray(details) ? details.find((item) => item && typeof item === "object" && String((item as { merchantRefId?: unknown }).merchantRefId ?? "") === payout.merchantTransferId) as Record<string, unknown> | undefined : undefined;
  if (!match) return { payoutId: payout.id, localStatus: payout.status, providerStatus: "UNIDENTIFIED", action: "NO_MUTATION" as const };
  return applyProviderTransferStatus(payout.id, String(match.txnStatus ?? ""), { payuRefId: match.payuTransactionRefNo, bankReferenceId: match.bankTransactionRefNo, message: match.txnStatusDescription ?? match.msg, responseCode: match.responseCode, amount: match.amount });
}

export async function applyProviderTransferStatus(payoutId: string, providerStatus: string, metadata: { payuRefId?: unknown; bankReferenceId?: unknown; message?: unknown; responseCode?: unknown; amount?: unknown }) {
  const normalized = providerStatus.toUpperCase();
  const mapped = normalized === "SUCCESS" ? "SUCCESS" : normalized === "FAILED" ? "FAILED" : normalized === "IN_PROGRESS" || normalized === "PENDING" || normalized === "QUEUED" || normalized === "WAITING_FOR_RETRY" ? "PROCESSING" : "UNKNOWN";
  if (mapped === "UNKNOWN") return { payoutId, providerStatus: normalized, action: "NO_MUTATION" as const };

  if (mapped === "SUCCESS") {
    return prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { id: true, withdrawalRequestId: true, amount: true, currency: true, status: true, merchantTransferId: true } });
      if (!payout) throw new Error("PAYOUT_NOT_FOUND");
      if (payout.status === PayoutStatus.PAID) return { payoutId, status: PayoutStatus.PAID, action: "IDEMPOTENT" as const };
      if (payout.status === PayoutStatus.REVERSED) return { payoutId, status: PayoutStatus.REVERSED, action: "NO_MUTATION" as const };
      const withdrawal = await tx.withdrawalRequest.findUnique({ where: { id: payout.withdrawalRequestId }, select: { id: true, walletId: true, currency: true, amount: true, status: true } });
      if (!withdrawal || withdrawal.amount.toString() !== payout.amount.toString() || withdrawal.currency !== payout.currency) throw new Error("PAYOUT_FINANCIAL_MISMATCH");
      if (metadata.amount !== undefined && Number(metadata.amount) !== Number(payout.amount)) throw new Error("PAYOUT_AMOUNT_MISMATCH");
      const walletRows = await tx.$queryRaw<Array<{ id: string; currency: string; balance: string }>>(Prisma.sql`SELECT "id","currency","balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${withdrawal.walletId}::uuid FOR UPDATE`);
      const wallet = walletRows[0];
      if (!wallet || wallet.currency !== payout.currency) throw new Error("PAYOUT_WALLET_MISMATCH");
      const existingDebit = await tx.walletTransaction.findFirst({ where: { walletId: wallet.id, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, type: "DEBIT", category: "WITHDRAWAL" }, select: { id: true, amount: true, currency: true } });
      if (!existingDebit) {
        if (compareMoney(wallet.balance, payout.amount.toString()) < 0) throw new Error("INSUFFICIENT_WALLET_BALANCE");
        const balanceCents = BigInt(wallet.balance.replace(".", "")) - BigInt(payout.amount.toString().replace(".", ""));
        const nextBalance = `${balanceCents / 100n}.${(balanceCents % 100n).toString().padStart(2, "0")}`;
        await tx.walletTransaction.create({ data: { walletId: wallet.id, type: "DEBIT", category: "WITHDRAWAL", amount: payout.amount, currency: payout.currency, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, description: "Successful PayU payout" } });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: nextBalance } });
      } else if (existingDebit.amount.toString() !== payout.amount.toString() || existingDebit.currency !== payout.currency) throw new Error("PAYOUT_LEDGER_TERM_MISMATCH");
      await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PAID, providerTransferId: metadata.payuRefId ? String(metadata.payuRefId) : undefined, providerReference: metadata.bankReferenceId ? String(metadata.bankReferenceId) : undefined, completedAt: new Date(), failureCode: null, failureReason: null } });
      await tx.withdrawalRequest.update({ where: { id: withdrawal.id }, data: { status: WithdrawalRequestStatus.PAID } });
      return { payoutId, status: PayoutStatus.PAID, action: "PAID" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  if (mapped === "FAILED") {
    return prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { id: true, withdrawalRequestId: true, status: true } });
      if (!payout) throw new Error("PAYOUT_NOT_FOUND");
      if (payout.status === PayoutStatus.PAID) return { payoutId, status: PayoutStatus.PAID, action: "NO_MUTATION" as const };
      if (payout.status === PayoutStatus.FAILED) return { payoutId, status: PayoutStatus.FAILED, action: "IDEMPOTENT" as const };
      await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.FAILED, failureCode: metadata.responseCode ? String(metadata.responseCode).slice(0, 128) : "PAYU_TRANSFER_FAILED", failureReason: safeProviderMessage(metadata.message) || "PayU reported a definitive transfer failure.", completedAt: new Date() } });
      await tx.withdrawalRequest.updateMany({ where: { id: payout.withdrawalRequestId, status: { in: [WithdrawalRequestStatus.PAYOUT_INITIATED, WithdrawalRequestStatus.PROCESSING] } }, data: { status: WithdrawalRequestStatus.FAILED } });
      return { payoutId, status: PayoutStatus.FAILED, action: "FAILED" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { id: true, status: true, withdrawalRequestId: true } });
    if (!payout || payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REVERSED) return;
    await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PROCESSING, providerTransferId: metadata.payuRefId ? String(metadata.payuRefId) : undefined } });
    await tx.withdrawalRequest.updateMany({ where: { id: payout.withdrawalRequestId, status: WithdrawalRequestStatus.PAYOUT_INITIATED }, data: { status: WithdrawalRequestStatus.PROCESSING } });
  });
  return { payoutId, status: PayoutStatus.PROCESSING, action: "PROCESSING" as const };
}

export async function handlePayUPayoutWebhook(input: { event: string; authorization?: string; payoutMerchantId?: string; merchantReferenceId?: string; payuRefId?: string; bankReferenceId?: string; msg?: string; responseCode?: string }) {
  const config = getPayUPayoutConfig();
  if (input.authorization !== config.webhookSecret) throw new Error("INVALID_WEBHOOK_AUTHORIZATION");
  if (input.payoutMerchantId && input.payoutMerchantId !== config.merchantId) throw new Error("INVALID_PAYOUT_MERCHANT");
  const fingerprint = createHash("sha256").update(JSON.stringify({ event: input.event, merchantReferenceId: input.merchantReferenceId ?? null, payuRefId: input.payuRefId ?? null, bankReferenceId: input.bankReferenceId ?? null, msg: input.msg ?? null, responseCode: input.responseCode ?? null })).digest("hex");
  const existingEvent = await prisma.payoutWebhookEvent.findUnique({ where: { fingerprint }, select: { id: true, payoutId: true } });
  if (existingEvent) return { duplicate: true, payoutId: existingEvent.payoutId };
  const payout = input.merchantReferenceId ? await prisma.payout.findUnique({ where: { merchantTransferId: input.merchantReferenceId }, select: { id: true } }) : input.payuRefId ? await prisma.payout.findFirst({ where: { providerTransferId: input.payuRefId }, select: { id: true } }) : null;
  await prisma.payoutWebhookEvent.create({ data: { provider: PROVIDER, eventType: input.event, merchantTransferId: input.merchantReferenceId || null, providerReference: input.payuRefId || input.bankReferenceId || null, fingerprint, payoutId: payout?.id || null } });
  if (!payout) return { duplicate: false, payoutId: null, action: "UNKNOWN_PAYOUT" as const };
  if (input.event === "TRANSFER_SUCCESS") return applyProviderTransferStatus(payout.id, "SUCCESS", { payuRefId: input.payuRefId, bankReferenceId: input.bankReferenceId, message: input.msg, responseCode: input.responseCode });
  if (input.event === "TRANSFER_FAILED" || input.event === "REQUEST_PROCESSING_FAILED") return applyProviderTransferStatus(payout.id, "FAILED", { payuRefId: input.payuRefId, bankReferenceId: input.bankReferenceId, message: input.msg, responseCode: input.responseCode });
  if (input.event === "TRANSFER_REVERSED") return prisma.$transaction(async (tx) => {
    const current = await tx.payout.findUnique({ where: { id: payout.id }, select: { status: true } });
    if (!current || current.status === PayoutStatus.REVERSED) return { payoutId: payout.id, status: PayoutStatus.REVERSED, action: "IDEMPOTENT" as const };
    await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.REVERSED, providerTransferId: input.payuRefId || undefined, providerReference: input.bankReferenceId || undefined, failureReason: safeProviderMessage(input.msg) || "PayU transfer was reversed.", completedAt: new Date() } });
    await tx.withdrawalRequest.update({ where: { id: (await tx.payout.findUniqueOrThrow({ where: { id: payout.id }, select: { withdrawalRequestId: true } })).withdrawalRequestId }, data: { status: WithdrawalRequestStatus.REVERSED } });
    return { payoutId: payout.id, status: PayoutStatus.REVERSED, action: "REVERSED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { duplicate: false, payoutId: payout.id, action: "IGNORED_EVENT" as const };
}

export function formatPayoutError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    WITHDRAWAL_NOT_APPROVED: "Only an approved withdrawal can be paid out.",
    PAYOUT_ALREADY_ACTIVE: "This withdrawal already has an active payout. Check PayU status before retrying.",
    DESTINATION_NOT_VERIFIED: "The payout destination must be verified before processing.",
    PAYU_VPA_VALIDATION_FAILED: "PayU could not validate the selected UPI VPA.",
    PAYU_BENEFICIARY_CREATION_FAILED: "PayU beneficiary registration failed. No transfer was initiated.",
    BENEFICIARY_CREATION_IN_PROGRESS: "Beneficiary registration is already in progress. Do not retry immediately.",
    PAYU_TRANSFER_REJECTED: "PayU rejected the payout request. The reserved withdrawal amount was released.",
    PAYU_TRANSFER_UNCERTAIN: "PayU did not provide a definitive result. The payout remains protected; check PayU status before retrying.",
    PAYU_AMOUNT_MISMATCH: "PayU reported an amount that does not match the withdrawal.",
    INVALID_PAYMENT_TYPE: "Unsupported payout payment type.",
  };
  return messages[code] ?? "The payout could not be processed safely.";
}
