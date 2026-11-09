"use server";

import { revalidatePath } from "next/cache";
import { createPayoutDestination, disablePayoutDestination, formatPayoutDestinationError } from "@/lib/payout-destination";

export type PayoutDestinationActionState = { ok: boolean; message?: string };

export async function createPayoutDestinationAction(_previous: PayoutDestinationActionState, formData: FormData): Promise<PayoutDestinationActionState> {
  const type = String(formData.get("type") ?? "");
  try {
    const displayName = String(formData.get("displayName") ?? "");
    const input = type === "UPI"
      ? { type: "UPI" as const, displayName, upiId: String(formData.get("upiId") ?? "") }
      : type === "BANK_ACCOUNT"
        ? { type: "BANK_ACCOUNT" as const, displayName, accountHolderName: String(formData.get("accountHolderName") ?? ""), accountNumber: String(formData.get("accountNumber") ?? ""), ifsc: String(formData.get("ifsc") ?? ""), bankName: String(formData.get("bankName") ?? "") }
        : { type: type as "UPI", displayName, upiId: "" };

    await createPayoutDestination(input);
    revalidatePath("/dashboard/wallet/payout-methods");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: "Payout details saved securely. They are pending verification and cannot be used for an approved withdrawal until verified." };
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_DESTINATION_DATA") {
      return {
        ok: false,
        message: type === "UPI"
          ? "Enter a valid UPI ID in the format name@bank (for example, name@okaxis)."
          : type === "BANK_ACCOUNT"
            ? "Check the bank details: account number must contain 9–18 digits, IFSC must be 11 characters, and the account holder and bank names are required."
            : "Select UPI or bank account and enter the required details.",
      };
    }
    return { ok: false, message: formatPayoutDestinationError(error) };
  }
}

export async function disablePayoutDestinationAction(_previous: PayoutDestinationActionState, formData: FormData): Promise<PayoutDestinationActionState> {
  try {
    await disablePayoutDestination(String(formData.get("destinationId") ?? ""));
    revalidatePath("/dashboard/wallet/payout-methods");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: "Payout destination disabled." };
  } catch (error) {
    return { ok: false, message: formatPayoutDestinationError(error) };
  }
}
