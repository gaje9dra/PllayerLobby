"use server";

import { revalidatePath } from "next/cache";
import { formatWithdrawalError, rejectWithdrawalRequest } from "@/lib/withdrawal";
import { approveWithdrawalRequestWithDestination, formatWithdrawalDestinationError } from "@/lib/withdrawal-destination";
import { formatPayoutError, initiateWithdrawalPayout, reconcilePayUPayout } from "@/lib/payu-payout-processing";
import { retryFailedWithdrawalPayout } from "@/lib/payu-payout-retry";

export type AdminWithdrawalActionState = { ok: boolean; message?: string };

function formatAdminError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const payoutCodes = ["WITHDRAWAL_NOT_APPROVED", "PAYOUT_ALREADY_ACTIVE", "PAYOUT_RETRY_NOT_ALLOWED", "DESTINATION_NOT_VERIFIED", "PAYU_VPA_VALIDATION_FAILED", "PAYU_BENEFICIARY_CREATION_FAILED", "BENEFICIARY_CREATION_IN_PROGRESS", "PAYU_TRANSFER_REJECTED", "PAYU_TRANSFER_UNCERTAIN", "INVALID_PAYMENT_TYPE", "UPI_REQUIRES_UPI_PAYMENT_TYPE", "BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE"];
  if (payoutCodes.includes(code)) return formatPayoutError(error);
  const destinationCodes = ["DESTINATION_OWNERSHIP_MISMATCH", "DESTINATION_SNAPSHOT_MISMATCH", "MISSING_DESTINATION_SNAPSHOT", "DESTINATION_DATA_CORRUPTED"];
  return destinationCodes.includes(code) ? formatWithdrawalDestinationError(error) : formatWithdrawalError(error);
}

export async function approveWithdrawalAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const id = String(formData.get("withdrawalId") ?? "");
    const result = await approveWithdrawalRequestWithDestination(id);
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `Withdrawal ₹${result.amount.toFixed(2)} approved. No payout was initiated.` };
  } catch (error) {
    return { ok: false, message: formatAdminError(error) };
  }
}

export async function rejectWithdrawalAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const id = String(formData.get("withdrawalId") ?? "");
    const reason = String(formData.get("reason") ?? "");
    await rejectWithdrawalRequest(id, reason);
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: "Withdrawal rejected and its reserved amount is available again." };
  } catch (error) {
    return { ok: false, message: formatWithdrawalError(error) };
  }
}

export async function processPayoutAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const withdrawalId = String(formData.get("withdrawalId") ?? "");
    const paymentType = String(formData.get("paymentType") ?? "");
    const isRetry = String(formData.get("retry") ?? "") === "true";
    const result = isRetry ? await retryFailedWithdrawalPayout(withdrawalId, paymentType) : await initiateWithdrawalPayout(withdrawalId, paymentType);
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    return { ok: true, message: `PayU payout ${result.merchantTransferId} is ${result.status.toLowerCase().replaceAll("_", " ")}. Final payment status will come from PayU.` };
  } catch (error) {
    return { ok: false, message: formatAdminError(error) };
  }
}

export async function checkPayoutStatusAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const payoutId = String(formData.get("payoutId") ?? "");
    const result = await reconcilePayUPayout(payoutId);
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    return { ok: true, message: `PayU status: ${"providerStatus" in result ? result.providerStatus : result.status}.` };
  } catch (error) {
    return { ok: false, message: formatAdminError(error) };
  }
}
