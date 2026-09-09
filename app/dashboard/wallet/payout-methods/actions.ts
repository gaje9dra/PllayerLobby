"use server";

import { revalidatePath } from "next/cache";
import { createPayoutDestination, disablePayoutDestination, formatPayoutDestinationError } from "@/lib/payout-destination";

export type PayoutDestinationActionState = { ok: boolean; message?: string };
const initialState: PayoutDestinationActionState = { ok: false };

export async function createPayoutDestinationAction(_previous: PayoutDestinationActionState, formData: FormData): Promise<PayoutDestinationActionState> {
  try {
    const type = String(formData.get("type") ?? "");
    const displayName = String(formData.get("displayName") ?? "");
    const input = type === "UPI"
      ? { type: "UPI" as const, displayName, upiId: String(formData.get("upiId") ?? "") }
      : type === "BANK_ACCOUNT"
        ? { type: "BANK_ACCOUNT" as const, displayName, accountHolderName: String(formData.get("accountHolderName") ?? ""), accountNumber: String(formData.get("accountNumber") ?? ""), ifsc: String(formData.get("ifsc") ?? ""), bankName: String(formData.get("bankName") ?? "") }
        : { type: type as "UPI", displayName, upiId: "" };
    await createPayoutDestination(input);
    revalidatePath("/dashboard/wallet/payout-methods");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: "Payout destination added. Verification is not yet available, so it cannot be used for an approved withdrawal yet." };
  } catch (error) {
    return { ok: false, message: formatPayoutDestinationError(error) };
  }
}

export async function disablePayoutDestinationAction(_previous: PayoutDestinationActionState, formData: FormData): Promise<PayoutDestinationActionState> {
  try {
    await disablePayoutDestination(String(formData.get("destinationId") ?? ""));
    revalidatePath("/dashboard/wallet/payout-methods");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ...initialState, ok: true, message: "Payout destination disabled." };
  } catch (error) {
    return { ...initialState, ok: false, message: formatPayoutDestinationError(error) };
  }
}
