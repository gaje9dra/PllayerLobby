"use server";

import { revalidatePath } from "next/cache";
import { formatWithdrawalError, rejectWithdrawalRequest } from "@/lib/withdrawal";
import { approveWithdrawalRequestWithDestination } from "@/lib/withdrawal-destination";

export type AdminWithdrawalActionState = { ok: boolean; message?: string };

export async function approveWithdrawalAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const id = String(formData.get("withdrawalId") ?? "");
    const result = await approveWithdrawalRequestWithDestination(id);
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `Withdrawal ₹${result.amount.toFixed(2)} approved. No payout was initiated.` };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "DESTINATION_NOT_VERIFIED" ? "Withdrawal cannot be approved until its payout destination is verified." : formatWithdrawalError(error);
    return { ok: false, message };
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
