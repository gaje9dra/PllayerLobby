"use server";

import { revalidatePath } from "next/cache";
import { formatWithdrawalError, rejectWithdrawalRequest } from "@/lib/withdrawal";
import { approveWithdrawalRequestWithDestination, formatWithdrawalDestinationError } from "@/lib/withdrawal-destination";
import { formatPayoutError, initiateWithdrawalPayout, reconcilePayUPayout, retryFailedWithdrawalPayout } from "@/lib/payu-payout-processing";
import { recordAdminAuditEvent } from "@/lib/admin-audit";

export type AdminWithdrawalActionState = { ok: boolean; message?: string };

function formatAdminError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const payoutCodes = ["PAYU_PAYOUT_ENVIRONMENT_INVALID", "PAYU_PAYOUT_PRODUCTION_DISABLED", "PAYU_AUTH_FAILED", "WITHDRAWAL_NOT_APPROVED", "PAYOUT_ALREADY_ACTIVE", "PAYOUT_RETRY_NOT_ALLOWED", "DESTINATION_NOT_VERIFIED", "DESTINATION_DISABLED", "DESTINATION_SNAPSHOT_MISMATCH", "PAYU_VPA_VALIDATION_FAILED", "PAYU_BENEFICIARY_CREATION_FAILED", "BENEFICIARY_CREATION_IN_PROGRESS", "PAYU_TRANSFER_REJECTED", "PAYU_TRANSFER_UNCERTAIN", "PAYU_TRANSFER_HTTP_ERROR", "INVALID_PAYMENT_TYPE", "UPI_REQUIRES_UPI_PAYMENT_TYPE", "BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE", "PAYOUT_AMOUNT_MISMATCH", "WALLET_INTEGRITY_ERROR", "INSUFFICIENT_WALLET_BALANCE", "PAYOUT_STATE_CONFLICT", "INVALID_PAYOUT_STATE_TRANSITION"];
  if (payoutCodes.includes(code)) return formatPayoutError(error);
  const destinationCodes = ["DESTINATION_OWNERSHIP_MISMATCH", "MISSING_DESTINATION_SNAPSHOT", "DESTINATION_DATA_CORRUPTED", "WITHDRAWAL_INTEGRITY_ERROR"];
  return destinationCodes.includes(code) ? formatWithdrawalDestinationError(error) : formatWithdrawalError(error);
}

async function audit(action: string, targetId: string, metadata?: Record<string, unknown>) {
  try {
    await recordAdminAuditEvent({ action, targetType: "WITHDRAWAL", targetId, metadata });
  } catch (error) {
    console.error("Admin audit logging failed:", error instanceof Error ? error.name : "unknown");
  }
}

function paymentType(formData: FormData) { return String(formData.get("paymentType") ?? ""); }

export async function approveWithdrawalAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const id = String(formData.get("withdrawalId") ?? "");
    const result = await approveWithdrawalRequestWithDestination(id);
    await audit("WITHDRAWAL_APPROVED", id, { amount: result.amount.toFixed(2), currency: result.currency });
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `Withdrawal ₹${result.amount.toFixed(2)} approved. It is ready for PayU processing.` };
  } catch (error) { return { ok: false, message: formatAdminError(error) }; }
}

export async function rejectWithdrawalAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const id = String(formData.get("withdrawalId") ?? "");
    const reason = String(formData.get("reason") ?? "");
    await rejectWithdrawalRequest(id, reason);
    await audit("WITHDRAWAL_REJECTED", id);
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: "Withdrawal rejected and its reserved amount is available again." };
  } catch (error) { return { ok: false, message: formatAdminError(error) }; }
}

export async function processPayoutAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const id = String(formData.get("withdrawalId") ?? "");
    const type = paymentType(formData);
    const result = await initiateWithdrawalPayout(id, type);
    await audit("PAYOUT_INITIATED", id, { payoutId: result.id, merchantTransferId: result.merchantTransferId, paymentType: type });
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `PayU accepted payout ${result.merchantTransferId} for processing. It is not marked PAID until PayU confirms success.` };
  } catch (error) { return { ok: false, message: formatAdminError(error) }; }
}

export async function checkPayoutStatusAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const payoutId = String(formData.get("payoutId") ?? "");
    const result = await reconcilePayUPayout(payoutId);
    await audit("PAYOUT_RECONCILED", payoutId, { providerStatus: result.providerStatus, localStatus: result.localStatus });
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `PayU status: ${result.providerStatus}.` };
  } catch (error) { return { ok: false, message: formatAdminError(error) }; }
}

export async function retryPayoutAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const id = String(formData.get("withdrawalId") ?? "");
    const type = paymentType(formData);
    const result = await retryFailedWithdrawalPayout(id, type);
    await audit("PAYOUT_RETRY_INITIATED", id, { payoutId: result.id, merchantTransferId: result.merchantTransferId, paymentType: type });
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `Retry ${result.id} was accepted for processing. It uses a new payout attempt.` };
  } catch (error) { return { ok: false, message: formatAdminError(error) }; }
}
