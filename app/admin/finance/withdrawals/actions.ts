"use server";

import { revalidatePath } from "next/cache";
import { formatWithdrawalError, rejectWithdrawalRequest } from "@/lib/withdrawal";
import { approveWithdrawalRequestWithDestination, formatWithdrawalDestinationError } from "@/lib/withdrawal-destination";

export type AdminWithdrawalActionState = { ok: boolean; message?: string };

function formatAdminError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const destinationCodes = ["DESTINATION_NOT_VERIFIED", "DESTINATION_OWNERSHIP_MISMATCH", "DESTINATION_SNAPSHOT_MISMATCH", "MISSING_DESTINATION_SNAPSHOT", "DESTINATION_DATA_CORRUPTED"];
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
