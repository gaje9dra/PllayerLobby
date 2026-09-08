"use server";

import { revalidatePath } from "next/cache";
import { approveWithdrawalRequest, formatWithdrawalError, rejectWithdrawalRequest } from "@/lib/withdrawal";

export type AdminWithdrawalActionState = { ok: boolean; message?: string };

export async function approveWithdrawalAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    const id = String(formData.get("withdrawalId") ?? "");
    const result = await approveWithdrawalRequest(id);
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `Withdrawal ₹${result.amount.toFixed(2)} approved. No payout was initiated.` };
  } catch (error) {
    return { ok: false, message: formatWithdrawalError(error) };
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
