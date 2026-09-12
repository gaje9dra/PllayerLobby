"use server";

import { revalidatePath } from "next/cache";
import { cancelCurrentUserDeposit, formatDepositError } from "@/lib/wallet-deposit";

export async function cancelDepositAction(formData: FormData) {
  const id = String(formData.get("depositId") ?? "");
  try {
    const deposit = await cancelCurrentUserDeposit(id);
    revalidatePath("/dashboard/wallet");
    revalidatePath(`/dashboard/wallet/deposit/${id}`);
    return { ok: true, message: `Deposit of ₹${deposit.amount.toFixed(2)} was cancelled.` };
  } catch (error) {
    return { ok: false, message: formatDepositError(error) };
  }
}
