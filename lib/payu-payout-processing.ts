import "server-only";

import { Prisma, PayoutStatus, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPayUPayoutConfig, createPayUBeneficiary, getPayUTransferStatus, initiatePayUTransfer, validatePayUVpa, type PayUPaymentType } from "@/lib/payu-payout-client";
import { decryptPayoutData } from "@/lib/payout-crypto";
import { validatePayoutDestinationInput } from "@/lib/payout-destination-validation";
import { creditWallet, debitWallet } from "@/lib/wallet";

const PROVIDER = "PAYU";

function safeProviderMessage(value: unknown) {
  return String(value ?? "Provider request failed").replace(/[\r\n]+/g, " ").slice(0, 300);
}

function requiredString(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function parseSnapshot(encrypted: string, type: "UPI" | "BANK_ACCOUNT") {
  let data: unknown;
  try { data = decryptPayoutData(encrypted); } catch { throw new Error("DESTINATION_DATA_CORRUPTED"); }
  if (!data || typeof data !== "object") throw new Error("DESTINATION_DATA_CORRUPTED");
  const input = data as Record<string, unknown>;
  const normalized = validatePayoutDestinationInput({
    type,
    displayName: String(input.displayName ?? "Player payout"),
    upiId: typeof input.upiId === "string" ? input.upiId : "",
    accountNumber: typeof input.accountNumber === "string" ? input.accountNumber : "",
    ifsc: typeof input.ifsc === "string" ? input.ifsc : "",
    accountHolderName: typeof input.accountHolderName === "string" ? input.accountHolderName : "",
    bankName: typeof input.bankName === "string" ? input.bankName : "",
  });
  if (!normalized.ok) throw new Error("DESTINATION_DATA_CORRUPTED");
  return normalized.data;
}

async function ensureBeneficiary(input: { destinationId: string; type: "UPI" | "BANK_ACCOUNT"; data: ReturnType<typeof parseSnapshot>; name: string; email: string; mobile?: string }) {
  const existing = await prisma.payoutBeneficiary.findUnique({ where: { payoutDestinationId_provider: { payoutDestinationId: input.destinationId, provider: PROVIDER } } });
  if (existing?.status === "ACTIVE") return existing;
  if (existing?.status === "PENDING") throw new Error("BENEFICIARY_CREATION_IN_PROGRESS");
  const created = await createPayUBeneficiary({ name: input.name, email: input.email, mobile: input.mobile, accountNo: input.type === "BANK_ACCOUNT" ? input.data.accountNumber : undefined, ifsc: input.type === "BANK_ACCOUNT" ? input.data.ifsc : undefined, vpa: input.type === "UPI" ? input.data.upiId : undefined });
  const providerId = created && typeof created === "object" && "data" in created && Array.isArray((created as { data?: unknown }).data) ? String(((created as { data: unknown[] }).data[0] as Record<string, unknown>)?.beneficiaryId ?? "") : "";
  if (!providerId) throw new Error("PAYU_BENEFICIARY_CREATION_FAILED");
  return prisma.payoutBeneficiary.upsert({ where: { payoutDestinationId_provider: { payoutDestinationId: input.destinationId, provider: PROVIDER } }, update: { providerBeneficiaryId: providerId, status: "ACTIVE" }, create: { payoutDestinationId: input.destinationId, provider: PROVIDER, providerBeneficiaryId: providerId, status: "ACTIVE" } });
}

export function validatePaymentType(destinationType: "UPI" | "BANK_ACCOUNT", paymentType: string): PayUPaymentType {
  const value = paymentType as PayUPaymentType;
  if (!["UPI", "IMPS", "NEFT", "RTGS"].includes(value)) throw new Error("INVALID_PAYMENT_TYPE");
  if (destinationType === "UPI" && value !== "UPI") throw new Error("UPI_REQUIRES_UPI_PAYMENT_TYPE");
  if (destinationType === "BANK_ACCOUNT" && value === "UPI") throw new Error("BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE");
  return value;
}

async function preparePayout(withdrawalId: string, paymentType: string, retry: boolean) {
  const payoutType = validatePaymentType("BANK_ACCOUNT", paymentType);
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { id: true, userId: true, walletId: true, payoutDestinationId: true, destinationTypeSnapshot: true, destinationMaskedSnapshot: true, encryptedDestinationSnapshot: true, amount: true, currency: true, status: true } });
    if (!withdrawal) throw new Error("WITHDRAWAL_NOT_FOUND");
    if (!withdrawal.payoutDestinationId || !withdrawal.destinationTypeSnapshot || !withdrawal.destinationMaskedSnapshot || !withdrawal.encryptedDestinationSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");
    if (!retry && withdrawal.status !== WithdrawalRequestStatus.APPROVED) throw new Error("WITHDRAWAL_NOT_APPROVED");
    if (retry && withdrawal.status !== WithdrawalRequestStatus.FAILED) throw new Error("PAYOUT_RETRY_NOT_ALLOWED");
    const destination = await tx.payoutDestination.findUnique({ where: { id: withdrawal.payoutDestinationId }, select: { id: true, userId: true, type: true, status: true } });
    if (!destination || destination.userId !== withdrawal.userId || destination.type !== withdrawal.destinationTypeSnapshot || destination.status === "DISABLED") throw new Error("DESTINATION_OWNERSHIP_MISMATCH");
    const existing = await tx.payout.findFirst({ where: { withdrawalRequestId: withdrawal.id, status: { in: [PayoutStatus.PAYOUT_INITIATED, PayoutStatus.PROCESSING] } }, select: { id: true } });
    if (existing) throw new Error("PAYOUT_ALREADY_ACTIVE");
    const merchantTransferId = `${withdrawal.id.slice(0, 20)}${Date.now().toString(36)}`.slice(0, 40);
    const payout = await tx.payout.create({ data: { withdrawalRequestId: withdrawal.id, provider: PROVIDER, merchantTransferId, amount: withdrawal.amount, currency: withdrawal.currency, paymentType: payoutType, status: PayoutStatus.PAYOUT_INITIATED, initiatedAt: new Date() } });
    await tx.withdrawalRequest.update({ where: { id: withdrawal.id }, data: { status: WithdrawalRequestStatus.PAYOUT_INITIATED } });
    return { payout, withdrawal, payoutType };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function initiateWithdrawalPayout(withdrawalId: string, paymentType: string) {
  await requireAdmin();
  const preliminary = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { destinationTypeSnapshot: true } });
  if (!preliminary?.destinationTypeSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");
  const payoutType = validatePaymentType(preliminary.destinationTypeSnapshot, paymentType);
  const prepared = await preparePayout(withdrawalId, payoutType, false);
  const user = await prisma.user.findUnique({ where: { id: prepared.withdrawal.userId }, select: { name: true, email: true, phone: true } });
  if (!user) throw new Error("USER_NOT_FOUND");
  const snapshot = parseSnapshot(prepared.withdrawal.encryptedDestinationSnapshot!, prepared.withdrawal.destinationTypeSnapshot!);
  try {
    if (prepared.payoutType === "UPI") {
      const validation = await validatePayUVpa(String(snapshot.upiId));
      const valid = validation && typeof validation === "object" && "status" in validation ? Number((validation as { status?: unknown }).status) === 0 : false;
      if (!valid) throw new Error("PAYU_VPA_VALIDATION_FAILED");
    }
    await ensureBeneficiary({ destinationId: prepared.withdrawal.payoutDestinationId!, type: prepared.withdrawal.destinationTypeSnapshot!, data: snapshot, name: user.name || String(snapshot.accountHolderName || "Player"), email: user.email, mobile: user.phone || undefined });
    const transfer = await initiatePayUTransfer({ beneficiaryName: user.name || String(snapshot.accountHolderName || "Player"), beneficiaryEmail: user.email, beneficiaryMobile: user.phone || undefined, beneficiaryAccountNumber: prepared.payoutType === "UPI" ? undefined : String(snapshot.accountNumber), beneficiaryIfscCode: prepared.payoutType === "UPI" ? undefined : String(snapshot.ifsc), vpa: prepared.payoutType === "UPI" ? String(snapshot.upiId) : undefined, purpose: "PlayerLobby withdrawal", amount: Number(Number(prepared.withdrawal.amount).toFixed(2)), batchId: prepared.payout.id, merchantRefId: prepared.payout.merchantTransferId, paymentType: prepared.payoutType, retry: false });
    const providerStatus = transfer && typeof transfer === "object" && "status" in transfer ? Number((transfer as { status?: unknown }).status) : 1;
    const data = transfer && typeof transfer === "object" && "data" in transfer ? (transfer as { data?: unknown }).data : null;
    if (providerStatus !== 0) {
      const first = Array.isArray(data) ? data[0] : data;
      const code = first && typeof first === "object" && "code" in first ? String((first as { code?: unknown }).code ?? "PAYU_TRANSFER_REJECTED") : "PAYU_TRANSFER_REJECTED";
      const reason = first && typeof first === "object" && "error" in first ? safeProviderMessage((first as { error?: unknown }).error) : "PayU rejected the transfer request.";
      await updateFailedPayout(prepared.payout.id, prepared.withdrawal.id, code, reason || "PayU rejected the transfer request.");
      throw new Error("PAYU_TRANSFER_REJECTED");
    }
    await prisma.$transaction(async (tx) => { await tx.payout.update({ where: { id: prepared.payout.id }, data: { status: PayoutStatus.PROCESSING } }); await tx.withdrawalRequest.update({ where: { id: prepared.withdrawal.id }, data: { status: WithdrawalRequestStatus.PROCESSING } }); });
    return { ...prepared.payout, status: PayoutStatus.PROCESSING };
  } catch (error) {
    if (error instanceof Error && ["PAYU_VPA_VALIDATION_FAILED", "PAYU_BENEFICIARY_CREATION_FAILED", "BENEFICIARY_CREATION_IN_PROGRESS", "PAYU_TRANSFER_REJECTED"].includes(error.message)) throw error;
    throw new Error("PAYU_TRANSFER_UNCERTAIN");
  }
}

async function updateFailedPayout(payoutId: string, withdrawalId: string, code: string, reason: string) {
  await prisma.$transaction(async (tx) => { await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.FAILED, failureCode: code, failureReason: reason } }); await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.FAILED, rejectionReason: reason } }); });
}

export async function reconcilePayUPayout(payoutId: string) {
  await requireAdmin();
  const payout = await prisma.payout.findUnique({ where: { id: payoutId }, select: { id: true, withdrawalRequestId: true, merchantTransferId: true, status: true, amount: true, currency: true } });
  if (!payout) throw new Error("PAYOUT_NOT_FOUND");
  if (![PayoutStatus.PAYOUT_INITIATED, PayoutStatus.PROCESSING].includes(payout.status)) return payout;
  const response = await getPayUTransferStatus(payout.merchantTransferId);
  const providerStatus = extractProviderStatus(response, payout.merchantTransferId);
  if (providerStatus === "SUCCESS") await markPayoutPaid(payout.id, payout.withdrawalRequestId);
  else if (providerStatus === "FAILED") await markPayoutFailedFromProvider(payout.id, payout.withdrawalRequestId);
  else if (providerStatus === "REVERSED") await markPayoutReversed(payout.id, payout.withdrawalRequestId);
  return { ...payout, providerStatus };
}

function extractProviderStatus(response: unknown, merchantTransferId: string) {
  const records = response && typeof response === "object" && "data" in response ? (response as { data?: unknown }).data : response;
  const list = Array.isArray(records) ? records : [records];
  const row = list.find((item) => item && typeof item === "object" && String((item as Record<string, unknown>).merchantRefId ?? (item as Record<string, unknown>).merchantReferenceId ?? "") === merchantTransferId) as Record<string, unknown> | undefined;
  const value = String(row?.status ?? row?.transactionStatus ?? row?.txnStatus ?? "").toUpperCase();
  if (["SUCCESS", "SUCCESSFUL", "TRANSFER_SUCCESS", "COMPLETED", "PAID"].includes(value)) return "SUCCESS" as const;
  if (["FAILED", "FAILURE", "TRANSFER_FAILED", "REQUEST_PROCESSING_FAILED"].includes(value)) return "FAILED" as const;
  if (["REVERSED", "TRANSFER_REVERSED"].includes(value)) return "REVERSED" as const;
  return "PROCESSING" as const;
}

async function markPayoutPaid(payoutId: string, withdrawalId: string) {
  await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { status: true, amount: true, currency: true, withdrawalRequestId: true } });
    if (!payout || payout.withdrawalRequestId !== withdrawalId || payout.status === PayoutStatus.PAID) return;
    if (payout.status === PayoutStatus.REVERSED) throw new Error("PAYOUT_FINAL_STATE");
    const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { userId: true, walletId: true } });
    if (!request) throw new Error("WITHDRAWAL_NOT_FOUND");
    await debitWallet(request.walletId, payout.amount.toString(), "WITHDRAWAL_PAYOUT", payout.id, `Withdrawal payout ${payout.id}`, tx);
    await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.PAID, completedAt: new Date() } });
    await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.PAID } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function markPayoutFailedFromProvider(payoutId: string, withdrawalId: string) { await prisma.$transaction(async (tx) => { await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.FAILED, failureReason: "PayU reported definitive failure." } }); await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.FAILED, rejectionReason: "PayU reported definitive failure." } }); }); }
async function markPayoutReversed(payoutId: string, withdrawalId: string) { await prisma.$transaction(async (tx) => { await tx.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.REVERSED } }); await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.REVERSED } }); }); }

export function formatPayoutError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = { WITHDRAWAL_NOT_APPROVED: "The withdrawal must be approved before payout processing.", PAYOUT_ALREADY_ACTIVE: "A payout is already being processed for this withdrawal.", PAYU_VPA_VALIDATION_FAILED: "PayU could not validate the UPI VPA.", PAYU_BENEFICIARY_CREATION_FAILED: "PayU beneficiary creation failed.", BENEFICIARY_CREATION_IN_PROGRESS: "PayU beneficiary setup is still in progress.", PAYU_TRANSFER_REJECTED: "PayU rejected the payout request.", PAYU_TRANSFER_UNCERTAIN: "PayU response was uncertain. Do not retry until the payout status is reconciled.", PAYOUT_RETRY_NOT_ALLOWED: "Retry is allowed only after a definitive PayU failure.", INVALID_PAYMENT_TYPE: "Invalid payout payment type.", UPI_REQUIRES_UPI_PAYMENT_TYPE: "UPI destinations require UPI payout processing.", BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE: "Bank destinations require IMPS, NEFT, or RTGS processing." };
  return messages[code] ?? "Payout processing could not be completed.";
}

export function getPayoutEnvironment() { return getPayUPayoutConfig().environment; }
