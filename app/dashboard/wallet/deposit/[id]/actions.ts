"use server";

import { revalidatePath } from "next/cache";
import { cancelCurrentUserDeposit } from "@/lib/wallet-deposit";

export async function cancelDepositAction(formData: FormData): Promise<void> {
  const id = String(formData.get("depositId") ?? "");
  try {
    await cancelCurrentUserDeposit(id);
    revalidatePath("/dashboard/wallet");
    revalidatePath(`/dashboard/wallet/deposit/${id}`);
  } catch {
    // A failed cancellation leaves the server-backed deposit state unchanged.
    // The page can be refreshed to retrieve the authoritative state.
  }
}
