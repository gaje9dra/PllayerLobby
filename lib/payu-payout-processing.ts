import "server-only";

import crypto from "node:crypto";
import { Prisma, PayoutPaymentType, PayoutReconciliationStatus, PayoutStatus, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBeneficiary, getTransferStatus, initiateTransfer, validateVPA } from "@/lib/payu-payout-client";
import { decryptPayoutData } from "@/lib/payout-crypto";
import { validatePayoutDestinationInput } from "@/lib/payout-destination-validation";
import { addMoney, compareMoney, normalizeMoney, subtractMoney } from "@/lib/wallet-rules";
import { assertPayoutTransition } from "@/lib/payout-state";

const PROVIDER = "PAYU";
const ACTIVE = [PayoutStatus.PAYOUT_INITIATED, PayoutStatus.PROCESSING] as const;

type DestinationSnapshot =
  | { type: "UPI"; displayName: string; upiId: string }
  | { type: "BANK_ACCOUNT"; displayName: string; accountNumber: string; ifsc: string; accountHolderName: string; bankName: string };

type AuditEvent = { eventType: string; merchantTransferId?: string | null; providerReference?: string | null; payoutId?: string | null; payload?: Record<string, unknown> };

function safeMessage(value: unknown) { return String(value ?? "Provider request failed").replace(/[\r\n]+/g, " ").slice(0, 1000); }
function newMerchantRef() { return `PL${crypto.randomBytes(10).toString("hex")}${Date.now().toString(36)}`.slice(0, 40); }
function auditFingerprint(event: AuditEvent) { return crypto.createHash("sha256").update(JSON.stringify(event)).digest("hex"); }

function readSnapshot(encrypted: string, type: "UPI" | "BANK_ACCOUNT"): DestinationSnapshot {
  let raw: unknown;
  try { raw = JSON.parse(decryptPayoutData(encrypted)); } catch { throw new Error("DESTINATION_DATA_CORRUPTED"); }
  if (!raw || typeof raw !== "object") throw new Error("DESTINATION_DATA_CORRUPTED");
  const v = raw as Record<string, unknown>;
  const input = type === "UPI"
    ? { type: "UPI" as const, displayName: String(v.displayName ?? ""), upiId: String(v.upiId ?? "") }
    : { type: "BANK_ACCOUNT" as const, displayName: String(v.displayName ?? ""), accountNumber: String(v.accountNumber ?? ""), ifsc: String(v.ifsc ?? ""), accountHolderName: String(v.accountHolderName ?? ""), bankName: String(v.bankName ?? "") };
  const result = validatePayoutDestinationInput(input);
  if (!result) throw new Error("DESTINATION_DATA_CORRUPTED");
  return result.data.type === "UPI"
    ? { type: "UPI", displayName: result.displayName, upiId: result.data.upiId }
    : { type: "BANK_ACCOUNT", displayName: result.displayName, accountNumber: result.data.accountNumber, ifsc: result.data.ifsc, accountHolderName: result.data.accountHolderName, bankName: result.data.bankName };
}

function paymentTypeFor(destinationType: "UPI" | "BANK_ACCOUNT", value: string): PayoutPaymentType {
  if (!["UPI", "IMPS", "NEFT", "RTGS"].includes(value)) throw new Error("INVALID_PAYMENT_TYPE");
  if (destinationType === "UPI" && value !== "UPI") throw new Error("UPI_REQUIRES_UPI_PAYMENT_TYPE");
  if (destinationType === "BANK_ACCOUNT" && value === "UPI") throw new Error("BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE");
  return value as PayoutPaymentType;
}
export const validatePaymentType = paymentTypeFor;

function fields(snapshot: DestinationSnapshot) {
  return snapshot.type === "UPI"
    ? { beneficiaryName: snapshot.displayName, vpa: snapshot.upiId, accountNumber: undefined, ifsc: undefined }
    : { beneficiaryName: snapshot.accountHolderName || snapshot.displayName, vpa: undefined, accountNumber: snapshot.accountNumber, ifsc: snapshot.ifsc };
}

async function ensureBeneficiary(destinationId: string, snapshot: DestinationSnapshot, user: { name: string | null; email: string; phone: string | null }) {
  const existing = await prisma.payoutBeneficiary.findUnique({ where: { payoutDestinationId_provider: { payoutDestinationId: destinationId, provider: PROVIDER } } });
  if (existing?.status === "ACTIVE") return existing;
  if (existing?.status === "PENDING") throw new Error("BENEFICIARY_CREATION_IN_PROGRESS");
  const f = fields(snapshot);
  const response = await createBeneficiary({ name: f.beneficiaryName || user.name || "Player", email: user.email, mobile: user.phone || undefined, accountNo: f.accountNumber, ifsc: f.ifsc, vpa: f.vpa });
  const root = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const providerId = String(data.beneficiaryId ?? "");
  if (Number(root.status ?? 1) !== 0 || !providerId) throw new Error("PAYU_BENEFICIARY_CREATION_FAILED");
  return prisma.payoutBeneficiary.upsert({ where: { payoutDestinationId_provider: { payoutDestinationId: destinationId, provider: PROVIDER } }, update: { providerBeneficiaryId: providerId, status: "ACTIVE" }, create: { payoutDestinationId: destinationId, provider: PROVIDER, providerBeneficiaryId: providerId, status: "ACTIVE" } });
}

async function recordAuditEvent(tx: Prisma.TransactionClient, event: AuditEvent) {
  await tx.payoutWebhookEvent.create({ data: { provider: PROVIDER, eventType: event.eventType, merchantTransferId: event.merchantTransferId ?? null, providerReference: event.providerReference ?? null, fingerprint: auditFingerprint(event), sanitizedPayload: event.payload ? JSON.stringify(event.payload).slice(0, 10000) : null, payoutId: event.payoutId ?? null, processedAt: new Date() } }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("Unique constraint")) return;
    throw error;
  });
}

async function preparePayout(withdrawalId: string, paymentType: PayoutPaymentType, retry: boolean) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { id: true, userId: true, payoutDestinationId: true, destinationTypeSnapshot: true, destinationMaskedSnapshot: true, encryptedDestinationSnapshot: true, amount: true, currency: true, status: true } });
    if (!request) throw new Error("WITHDRAWAL_NOT_FOUND");
    if (!request.payoutDestinationId || !request.destinationTypeSnapshot || !request.destinationMaskedSnapshot || !request.encryptedDestinationSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");
    if (request.status !== (retry ? WithdrawalRequestStatus.FAILED : WithdrawalRequestStatus.APPROVED)) throw new Error(retry ? "PAYOUT_RETRY_NOT_ALLOWED" : "WITHDRAWAL_NOT_APPROVED");
    if (request.currency !== "INR") throw new Error("CURRENCY_MISMATCH");
    const destination = await tx.payoutDestination.findUnique({ where: { id: request.payoutDestinationId }, select: { id: true, userId: true, type: true, status: true, maskedDestination: true } });
    if (!destination || destination.userId !== request.userId || destination.type !== request.destinationTypeSnapshot) throw new Error("DESTINATION_OWNERSHIP_MISMATCH");
    if (destination.status === "DISABLED") throw new Error("DESTINATION_DISABLED");
    if (destination.status !== "VERIFIED") throw new Error("DESTINATION_NOT_VERIFIED");
    if (destination.maskedDestination !== request.destinationMaskedSnapshot) throw new Error("DESTINATION_SNAPSHOT_MISMATCH");
    if (await tx.payout.findFirst({ where: { withdrawalRequestId: request.id, status: { in: [...ACTIVE] } }, select: { id: true } })) throw new Error("PAYOUT_ALREADY_ACTIVE");
    const previous = retry ? await tx.payout.findFirst({ where: { withdrawalRequestId: request.id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } }) : null;
    if (retry && (!previous || previous.status !== PayoutStatus.FAILED)) throw new Error("PAYOUT_RETRY_NOT_ALLOWED");
    const payout = await tx.payout.create({ data: { withdrawalRequestId: request.id, provider: PROVIDER, merchantTransferId: newMerchantRef(), previousPayoutId: previous?.id, amount: request.amount, currency: request.currency, paymentType, status: PayoutStatus.PAYOUT_INITIATED, reconciliationStatus: PayoutReconciliationStatus.NOT_CHECKED, initiatedAt: new Date() } });
    await tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.PAYOUT_INITIATED } });
    await recordAuditEvent(tx, { eventType: retry ? "RETRY_CREATED" : "PAYOUT_INITIATED", merchantTransferId: payout.merchantTransferId, payoutId: payout.id, payload: { previousPayoutId: previous?.id ?? null } });
    return { payout, request };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function setFailed(payoutId: string, withdrawalId: string, code: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { status: true, merchantTransferId: true } });
    if (!payout || payout.status === PayoutStatus.FAILED || payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REVERSED) return;
    assertPayoutTransition(payout.status, PayoutStatus.FAILED);
    await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.FAILED, reconciliationStatus: PayoutReconciliationStatus.FAILED, reconciliationMessage: reason.slice(0, 1000), lastReconciledAt: new Date(), failureCode: code.slice(0, 128), failureReason: reason.slice(0, 1000) } });
    await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.FAILED, rejectionReason: reason.slice(0, 1000) } });
    await recordAuditEvent(tx, { eventType: "LOCAL_DEFINITIVE_FAILURE", merchantTransferId: payout.merchantTransferId, payoutId, payload: { code, reason } });
  });
}

async function sendPrepared(prepared: Awaited<ReturnType<typeof preparePayout>>, retry: boolean) {
  const user = await prisma.user.findUnique({ where: { id: prepared.request.userId }, select: { name: true, email: true, phone: true, status: true } });
  if (!user || user.status !== "ACTIVE") throw new Error("USER_NOT_ACTIVE");
  const snapshot = readSnapshot(prepared.request.encryptedDestinationSnapshot!, prepared.request.destinationTypeSnapshot!);
  const f = fields(snapshot);
  try {
    if (prepared.payout.paymentType === PayoutPaymentType.UPI) {
      const validation = await validateVPA(f.vpa!);
      if (!validation || typeof validation !== "object" || Number((validation as Record<string, unknown>).status ?? 1) !== 0) {
        await setFailed(prepared.payout.id, prepared.request.id, "PAYU_VPA_INVALID", "PayU could not validate the payout VPA.");
        throw new Error("PAYU_VPA_VALIDATION_FAILED");
      }
    }
    await ensureBeneficiary(prepared.request.payoutDestinationId!, snapshot, user);
    const response = await initiateTransfer({ beneficiaryName: f.beneficiaryName || user.name || "Player", beneficiaryEmail: user.email, beneficiaryMobile: user.phone || undefined, accountNumber: f.accountNumber, ifsc: f.ifsc, vpa: f.vpa, purpose: retry ? "PlayerLobby withdrawal retry" : "PlayerLobby withdrawal", amount: Number(normalizeMoney(prepared.request.amount.toString())!), batchId: prepared.payout.id, merchantRefId: prepared.payout.merchantTransferId, paymentType: prepared.payout.paymentType, retry });
    const root = response && typeof response === "object" ? response as Record<string, unknown> : {};
    const status = Number(root.status ?? -1);
    if (status === 0) {
      return prisma.$transaction(async (tx) => {
        const current = await tx.payout.findUnique({ where: { id: prepared.payout.id }, select: { status: true } });
        if (!current) throw new Error("PAYOUT_NOT_FOUND");
        assertPayoutTransition(current.status, PayoutStatus.PROCESSING);
        const payout = await tx.payout.update({ where: { id: prepared.payout.id }, data: { status: PayoutStatus.PROCESSING, reconciliationStatus: PayoutReconciliationStatus.PENDING, reconciliationMessage: null }, select: { id: true, status: true, merchantTransferId: true, amount: true, currency: true, paymentType: true } });
        await tx.withdrawalRequest.update({ where: { id: prepared.request.id }, data: { status: WithdrawalRequestStatus.PROCESSING } });
        await recordAuditEvent(tx, { eventType: "TRANSFER_ACCEPTED", merchantTransferId: payout.merchantTransferId, payoutId: payout.id, payload: { providerStatus: "ACCEPTED" } });
        return payout;
      });
    }
    if (status === 1) {
      const rowValue = Array.isArray(root.data) ? root.data[0] : root.data;
      const row = rowValue && typeof rowValue === "object" ? rowValue as Record<string, unknown> : {};
      const reason = safeMessage(row.error ?? root.msg ?? "PayU rejected the transfer request.");
      await setFailed(prepared.payout.id, prepared.request.id, String(row.code ?? "PAYU_TRANSFER_REJECTED"), reason);
      throw new Error("PAYU_TRANSFER_REJECTED");
    }
    throw new Error("PAYU_TRANSFER_UNCERTAIN");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PAYU_TRANSFER_HTTP_ERROR") await setFailed(prepared.payout.id, prepared.request.id, code, "PayU rejected the payout request before accepting it.");
    if (["PAYU_VPA_VALIDATION_FAILED", "PAYU_TRANSFER_REJECTED", "PAYU_TRANSFER_UNCERTAIN", "BENEFICIARY_CREATION_IN_PROGRESS", "PAYU_BENEFICIARY_CREATION_FAILED", "PAYU_TRANSFER_HTTP_ERROR"].includes(code)) throw error;
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

export function providerResult(response: unknown, merchantRefId: string, expectedAmount: string, expectedCurrency: string) {
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

async function finalizeSuccessTx(tx: Prisma.TransactionClient, payoutId: string, withdrawalId: string, providerReference?: string, bankReference?: string) {
  const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { id: true, status: true, withdrawalRequestId: true, amount: true, currency: true } });
  if (!payout || payout.withdrawalRequestId !== withdrawalId) throw new Error("PAYOUT_NOT_FOUND");
  if (payout.status === PayoutStatus.PAID) {
    await tx.payout.update({ where: { id: payout.id }, data: { providerTransferId: providerReference || undefined, providerReference: bankReference || providerReference || undefined, reconciliationStatus: PayoutReconciliationStatus.MATCHED, reconciliationMessage: null, lastReconciledAt: new Date() } });
    return "ALREADY_PAID" as const;
  }
  if (payout.status === PayoutStatus.FAILED || payout.status === PayoutStatus.REVERSED) throw new Error("PAYOUT_STATE_CONFLICT");
  assertPayoutTransition(payout.status, PayoutStatus.PAID);
  const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { id: true, walletId: true, amount: true, currency: true, status: true } });
  if (!request || request.status === WithdrawalRequestStatus.PAID || request.status === WithdrawalRequestStatus.FAILED || request.status === WithdrawalRequestStatus.REVERSED) throw new Error("PAYOUT_STATE_CONFLICT");
  if (request.currency !== payout.currency || compareMoney(request.amount.toString(), payout.amount.toString()) !== 0) throw new Error("PAYOUT_AMOUNT_MISMATCH");
  const rows = await tx.$queryRaw<Array<{ id: string; currency: string; balance: string }>>(Prisma.sql`SELECT "id", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${request.walletId}::uuid FOR UPDATE`);
  const wallet = rows[0];
  if (!wallet || wallet.currency !== request.currency) throw new Error("WALLET_INTEGRITY_ERROR");
  if (compareMoney(wallet.balance, payout.amount.toString()) < 0) throw new Error("INSUFFICIENT_WALLET_BALANCE");
  const existing = await tx.walletTransaction.findFirst({ where: { walletId: request.walletId, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, type: "DEBIT", category: "WITHDRAWAL" }, select: { amount: true, currency: true } });
  if (!existing) {
    await tx.walletTransaction.create({ data: { walletId: request.walletId, type: "DEBIT", category: "WITHDRAWAL", amount: payout.amount, currency: request.currency, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, description: "Successful PayU payout" } });
    await tx.wallet.update({ where: { id: request.walletId }, data: { balance: subtractMoney(wallet.balance, payout.amount.toString()) } });
  } else if (existing.amount.toString() !== payout.amount.toString() || existing.currency !== payout.currency) throw new Error("PAYOUT_LEDGER_TERM_MISMATCH");
  await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PAID, providerTransferId: providerReference || undefined, providerReference: bankReference || providerReference || undefined, completedAt: new Date(), reconciliationStatus: PayoutReconciliationStatus.MATCHED, reconciliationMessage: null, lastReconciledAt: new Date() } });
  await tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.PAID } });
  return "PAID" as const;
}

async function finalizeFailureTx(tx: Prisma.TransactionClient, payoutId: string, withdrawalId: string, providerReference?: string, message?: string) {
  const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { id: true, status: true } });
  if (!payout) throw new Error("PAYOUT_NOT_FOUND");
  const reason = safeMessage(message || "PayU reported a definitive transfer failure.");
  if (payout.status === PayoutStatus.FAILED) {
    await tx.payout.update({ where: { id: payoutId }, data: { providerTransferId: providerReference || undefined, providerReference: providerReference || undefined, reconciliationStatus: PayoutReconciliationStatus.FAILED, reconciliationMessage: reason, lastReconciledAt: new Date() } });
    return "ALREADY_FAILED" as const;
  }
  if (payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REVERSED) throw new Error("PAYOUT_STATE_CONFLICT");
  assertPayoutTransition(payout.status, PayoutStatus.FAILED);
  await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.FAILED, providerTransferId: providerReference || undefined, providerReference: providerReference || undefined, failureCode: "PAYU_TRANSFER_FAILED", failureReason: reason, reconciliationStatus: PayoutReconciliationStatus.FAILED, reconciliationMessage: reason, lastReconciledAt: new Date() } });
  await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.FAILED, rejectionReason: reason } });
  return "FAILED" as const;
}

async function reversePayoutTx(tx: Prisma.TransactionClient, payoutId: string, withdrawalId: string, providerReference?: string, bankReference?: string) {
  const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { id: true, status: true, withdrawalRequestId: true, amount: true, currency: true } });
  if (!payout || payout.withdrawalRequestId !== withdrawalId) throw new Error("PAYOUT_NOT_FOUND");
  if (payout.status === PayoutStatus.REVERSED) return "ALREADY_REVERSED" as const;
  if (payout.status !== PayoutStatus.PAID) throw new Error("PAYOUT_STATE_CONFLICT");
  assertPayoutTransition(payout.status, PayoutStatus.REVERSED);
  const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { id: true, walletId: true, amount: true, currency: true, status: true } });
  if (!request || request.status !== WithdrawalRequestStatus.PAID || request.currency !== payout.currency || compareMoney(request.amount.toString(), payout.amount.toString()) !== 0) throw new Error("PAYOUT_STATE_CONFLICT");
  const rows = await tx.$queryRaw<Array<{ id: string; currency: string; balance: string }>>(Prisma.sql`SELECT "id", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${request.walletId}::uuid FOR UPDATE`);
  const wallet = rows[0];
  if (!wallet || wallet.currency !== request.currency) throw new Error("WALLET_INTEGRITY_ERROR");
  const debit = await tx.walletTransaction.findFirst({ where: { walletId: request.walletId, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, type: "DEBIT", category: "WITHDRAWAL" }, select: { amount: true, currency: true } });
  if (!debit || debit.currency !== payout.currency || compareMoney(debit.amount.toString(), payout.amount.toString()) !== 0) throw new Error("PAYOUT_LEDGER_TERM_MISMATCH");
  const credit = await tx.walletTransaction.findFirst({ where: { walletId: request.walletId, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, type: "CREDIT", category: "WITHDRAWAL" }, select: { amount: true, currency: true } });
  if (!credit) {
    await tx.walletTransaction.create({ data: { walletId: request.walletId, type: "CREDIT", category: "WITHDRAWAL", amount: payout.amount, currency: request.currency, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, description: "Reversal of PayU payout" } });
    await tx.wallet.update({ where: { id: request.walletId }, data: { balance: addMoney(wallet.balance, payout.amount.toString()) } });
  } else if (credit.amount.toString() !== payout.amount.toString() || credit.currency !== payout.currency) throw new Error("PAYOUT_LEDGER_TERM_MISMATCH");
  await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.REVERSED, providerTransferId: providerReference || undefined, providerReference: bankReference || providerReference || undefined, reversedAt: new Date(), reconciliationStatus: PayoutReconciliationStatus.REVERSED, reconciliationMessage: "PayU reversed the previously successful payout.", lastReconciledAt: new Date() } });
  await tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.REVERSED } });
  return "REVERSED" as const;
}

export async function reconcilePayUPayout(payoutId: string) {
  await requireAdmin();
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new Error("PAYOUT_NOT_FOUND");
  const response = await getTransferStatus(payout.merchantTransferId);
  const provider = providerResult(response, payout.merchantTransferId, payout.amount.toString(), payout.currency);
  return prisma.$transaction(async (tx) => {
    const current = await tx.payout.findUnique({ where: { id: payout.id }, select: { id: true, status: true, merchantTransferId: true, withdrawalRequestId: true } });
    if (!current) throw new Error("PAYOUT_NOT_FOUND");
    if (provider.state === "MISMATCH") {
      await tx.payout.update({ where: { id: current.id }, data: { reconciliationStatus: PayoutReconciliationStatus.MISMATCH, reconciliationMessage: "PayU status response amount/currency does not match the approved payout.", lastReconciledAt: new Date() } });
      await recordAuditEvent(tx, { eventType: "RECONCILIATION_MISMATCH", merchantTransferId: current.merchantTransferId, payoutId: current.id, payload: { providerStatus: "MISMATCH" } });
      return { payoutId, localStatus: current.status, providerStatus: "MISMATCH" as const };
    }
    if (provider.state === "UNKNOWN" || provider.state === "PROCESSING") {
      await tx.payout.update({ where: { id: current.id }, data: { reconciliationStatus: PayoutReconciliationStatus.PENDING, reconciliationMessage: provider.state === "UNKNOWN" ? "PayU did not return a definitive transaction record; payout remains unresolved." : null, lastReconciledAt: new Date(), providerReference: provider.providerReference || undefined } });
      await recordAuditEvent(tx, { eventType: "RECONCILIATION_PENDING", merchantTransferId: current.merchantTransferId, providerReference: provider.providerReference, payoutId: current.id, payload: { providerStatus: provider.state } });
      return { payoutId, localStatus: current.status, providerStatus: provider.state };
    }
    if (provider.state === "SUCCESS") {
      if (current.status === PayoutStatus.FAILED || current.status === PayoutStatus.REVERSED) {
        await tx.payout.update({ where: { id: current.id }, data: { reconciliationStatus: PayoutReconciliationStatus.CONFLICT, reconciliationMessage: "Provider SUCCESS conflicts with a local final failure/reversal.", lastReconciledAt: new Date() } });
        await recordAuditEvent(tx, { eventType: "RECONCILIATION_CONFLICT", merchantTransferId: current.merchantTransferId, providerReference: provider.providerReference, payoutId: current.id, payload: { providerStatus: "SUCCESS", localStatus: current.status } });
        return { payoutId, localStatus: current.status, providerStatus: "SUCCESS" as const, discrepancy: "LOCAL_FINAL_FAILURE_CONFLICTS_WITH_PROVIDER_SUCCESS" };
      }
      const action = await finalizeSuccessTx(tx, current.id, current.withdrawalRequestId, provider.providerReference, provider.bankReference);
      await recordAuditEvent(tx, { eventType: "RECONCILIATION_SUCCESS", merchantTransferId: current.merchantTransferId, providerReference: provider.providerReference, payoutId: current.id, payload: { providerStatus: "SUCCESS", accountingAction: action } });
      return { payoutId, localStatus: PayoutStatus.PAID, providerStatus: "SUCCESS" as const, providerReference: provider.providerReference ?? null };
    }
    if (current.status === PayoutStatus.PAID || current.status === PayoutStatus.REVERSED) {
      await tx.payout.update({ where: { id: current.id }, data: { reconciliationStatus: PayoutReconciliationStatus.CONFLICT, reconciliationMessage: "Provider FAILURE conflicts with a local final successful/reversed payout.", lastReconciledAt: new Date() } });
      await recordAuditEvent(tx, { eventType: "RECONCILIATION_CONFLICT", merchantTransferId: current.merchantTransferId, providerReference: provider.providerReference, payoutId: current.id, payload: { providerStatus: "FAILED", localStatus: current.status } });
      return { payoutId, localStatus: current.status, providerStatus: "FAILED" as const, discrepancy: "LOCAL_FINAL_SUCCESS_CONFLICTS_WITH_PROVIDER_FAILURE" };
    }
    const action = await finalizeFailureTx(tx, current.id, current.withdrawalRequestId, provider.providerReference, provider.message);
    await recordAuditEvent(tx, { eventType: "RECONCILIATION_FAILURE", merchantTransferId: current.merchantTransferId, providerReference: provider.providerReference, payoutId: current.id, payload: { providerStatus: "FAILED", accountingAction: action } });
    return { payoutId, localStatus: PayoutStatus.FAILED, providerStatus: "FAILED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function processPayUPayoutWebhook(event: { event: string; merchantReferenceId?: string; payuRefId?: string; bankReferenceId?: string; payoutMerchantId?: string; msg?: string; authorization?: string }) {
  const { getPayUPayoutConfig } = await import("@/lib/payu-payout-client");
  const config = getPayUPayoutConfig();
  if (event.authorization !== config.webhookSecret) throw new Error("INVALID_WEBHOOK_AUTHORIZATION");
  if (event.payoutMerchantId !== config.merchantId) throw new Error("INVALID_PAYOUT_MERCHANT_ID");
  const transactionEvents = new Set(["TRANSFER_SUCCESS", "TRANSFER_FAILED", "TRANSFER_REVERSED", "REQUEST_PROCESSING_FAILED"]);
  const requiresPayout = transactionEvents.has(event.event);
  if (requiresPayout && !event.merchantReferenceId && !event.payuRefId && !event.bankReferenceId) throw new Error("MISSING_MERCHANT_REFERENCE");
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ event: event.event, merchantReferenceId: event.merchantReferenceId ?? null, payuRefId: event.payuRefId ?? null, bankReferenceId: event.bankReferenceId ?? null, payoutMerchantId: event.payoutMerchantId ?? null, msg: event.msg ?? null })).digest("hex");
  return prisma.$transaction(async (tx) => {
    if (await tx.payoutWebhookEvent.findUnique({ where: { fingerprint }, select: { id: true } })) return { duplicate: true as const };
    const sanitizedPayload = JSON.stringify({ event: event.event, merchantReferenceId: event.merchantReferenceId ?? null, payuRefId: event.payuRefId ?? null, bankReferenceId: event.bankReferenceId ?? null, payoutMerchantId: event.payoutMerchantId ?? null, msg: safeMessage(event.msg) });
    if (!requiresPayout) {
      await tx.payoutWebhookEvent.create({ data: { provider: PROVIDER, eventType: event.event, merchantTransferId: event.merchantReferenceId ?? null, providerReference: event.payuRefId || event.bankReferenceId || null, fingerprint, sanitizedPayload, processedAt: new Date() } });
      return { recorded: true as const, action: "IGNORED" as const };
    }
    const payout = await tx.payout.findFirst({ where: { provider: PROVIDER, OR: [ ...(event.merchantReferenceId ? [{ merchantTransferId: event.merchantReferenceId }] : []), ...(event.payuRefId ? [{ providerTransferId: event.payuRefId }, { providerReference: event.payuRefId }] : []), ...(event.bankReferenceId ? [{ providerReference: event.bankReferenceId }] : []) ] }, select: { id: true, withdrawalRequestId: true, status: true, merchantTransferId: true } });
    if (!payout) {
      await tx.payoutWebhookEvent.create({ data: { provider: PROVIDER, eventType: event.event, merchantTransferId: event.merchantReferenceId ?? null, providerReference: event.payuRefId || event.bankReferenceId || null, fingerprint, sanitizedPayload, processedAt: new Date() } });
      return { unknown: true as const };
    }
    await tx.payoutWebhookEvent.create({ data: { provider: PROVIDER, eventType: event.event, merchantTransferId: event.merchantReferenceId ?? payout.merchantTransferId, providerReference: event.payuRefId || event.bankReferenceId || null, fingerprint, sanitizedPayload, payoutId: payout.id, processedAt: new Date() } });
    if (event.event === "REQUEST_PROCESSING_FAILED") {
      await tx.payout.update({ where: { id: payout.id }, data: { reconciliationStatus: PayoutReconciliationStatus.REQUIRED, reconciliationMessage: safeMessage(event.msg || "PayU reported request-processing failure; provider status must be reconciled."), lastReconciledAt: new Date(), providerTransferId: event.payuRefId || undefined, providerReference: event.payuRefId || undefined } });
      return { recorded: true as const, action: "RECONCILIATION_REQUIRED" as const, payoutId: payout.id };
    }
    if (event.event === "TRANSFER_SUCCESS") {
      if (payout.status === PayoutStatus.FAILED || payout.status === PayoutStatus.REVERSED) {
        await tx.payout.update({ where: { id: payout.id }, data: { reconciliationStatus: PayoutReconciliationStatus.CONFLICT, reconciliationMessage: "PayU SUCCESS conflicts with the local final payout state.", lastReconciledAt: new Date() } });
        return { recorded: true as const, action: "CRITICAL_MISMATCH" as const };
      }
      const action = await finalizeSuccessTx(tx, payout.id, payout.withdrawalRequestId, event.payuRefId, event.bankReferenceId);
      return { recorded: true as const, action: action === "ALREADY_PAID" ? "ALREADY_PAID" as const : "PAID" as const };
    }
    if (event.event === "TRANSFER_FAILED") {
      if (payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REVERSED) {
        await tx.payout.update({ where: { id: payout.id }, data: { reconciliationStatus: PayoutReconciliationStatus.CONFLICT, reconciliationMessage: "PayU FAILURE conflicts with the local final payout state.", lastReconciledAt: new Date() } });
        return { recorded: true as const, action: "CRITICAL_MISMATCH" as const };
      }
      await finalizeFailureTx(tx, payout.id, payout.withdrawalRequestId, event.payuRefId, event.msg);
      return { recorded: true as const, action: "FAILED" as const };
    }
    if (event.event === "TRANSFER_REVERSED") {
      if (payout.status !== PayoutStatus.PAID && payout.status !== PayoutStatus.REVERSED) {
        await tx.payout.update({ where: { id: payout.id }, data: { reconciliationStatus: PayoutReconciliationStatus.CONFLICT, reconciliationMessage: "PayU reversal arrived before a locally recorded successful payout.", lastReconciledAt: new Date() } });
        return { recorded: true as const, action: "CRITICAL_MISMATCH" as const };
      }
      const action = await reversePayoutTx(tx, payout.id, payout.withdrawalRequestId, event.payuRefId, event.bankReferenceId);
      return { recorded: true as const, action };
    }
    return { recorded: true as const, action: "IGNORED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function formatPayoutError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    PAYU_PAYOUT_ENVIRONMENT_INVALID: "PayU payout environment is invalid.", PAYU_PAYOUT_PRODUCTION_DISABLED: "Production payouts are disabled by the safety switch.", PAYU_AUTH_FAILED: "PayU payout authentication failed.", WITHDRAWAL_NOT_APPROVED: "The withdrawal must be approved before payout processing.", PAYOUT_ALREADY_ACTIVE: "A payout is already processing for this withdrawal.", PAYOUT_RETRY_NOT_ALLOWED: "Retry is allowed only after a definitive PayU failure.", DESTINATION_NOT_VERIFIED: "The payout destination must be verified before processing.", DESTINATION_DISABLED: "The payout destination is disabled.", DESTINATION_SNAPSHOT_MISMATCH: "The payout destination no longer matches the approved withdrawal snapshot.", PAYU_VPA_VALIDATION_FAILED: "PayU could not validate the payout VPA.", PAYU_BENEFICIARY_CREATION_FAILED: "PayU beneficiary registration failed.", BENEFICIARY_CREATION_IN_PROGRESS: "PayU beneficiary registration is still being reconciled.", PAYU_TRANSFER_REJECTED: "PayU rejected the payout request.", PAYU_TRANSFER_UNCERTAIN: "PayU did not provide a definitive result. Check PayU status before retrying.", PAYU_TRANSFER_HTTP_ERROR: "PayU rejected the payout request.", INVALID_PAYMENT_TYPE: "Invalid payout payment type.", UPI_REQUIRES_UPI_PAYMENT_TYPE: "UPI destinations require UPI payout processing.", BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE: "Bank destinations require IMPS, NEFT, or RTGS.", PAYOUT_AMOUNT_MISMATCH: "The payout amount does not match the withdrawal.", WALLET_INTEGRITY_ERROR: "Wallet integrity validation failed.", INSUFFICIENT_WALLET_BALANCE: "The wallet balance is insufficient for the payout.", PAYOUT_STATE_CONFLICT: "The provider result conflicts with an existing final financial state and requires reconciliation.", INVALID_PAYOUT_STATE_TRANSITION: "The payout state transition is not allowed." };
  return messages[code] ?? "Payout processing could not be completed.";
}
