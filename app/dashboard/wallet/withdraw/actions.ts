"use server";

import { revalidatePath } from "next/cache";
import { cancelWithdrawalRequest, formatWithdrawalError } from "@/lib/withdrawal";
import { createWithdrawalRequestWithDestination, formatWithdrawalDestinationError } from "@/lib/withdrawal-destination";

export type WithdrawalActionState = { ok: boolean; message?: string; withdrawalId?: string };

export async function createWithdrawalAction(_previous: WithdrawalActionState, formData: FormData): Promise<WithdrawalActionState> {
  try {
    const amount = String(formData.get("amount") ?? "");
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
    const destinationId = String(formData.get("payoutDestinationId") ?? "");
    const result = await createWithdrawalRequestWithDestination(amount, idempotencyKey, destinationId);
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: result.idempotent ? "This withdrawal request was already submitted." : "Withdrawal request submitted for admin review.", withdrawalId: result.request.id };
  } catch (error) {
    const destinationMessage = formatWithdrawalDestinationError(error);
    const knownDestinationCodes = ["DESTINATION_NOT_FOUND", "DESTINATION_DISABLED", "DESTINATION_DATA_CORRUPTED", "INVALID_IDEMPOTENCY_KEY", "IDEMPOTENCY_KEY_REUSED", "CURRENCY_MISMATCH"];
    return { ok: false, message: knownDestinationCodes.includes(error instanceof Error ? error.message : "") ? destinationMessage : formatWithdrawalError(error) };
  }
}

export async function cancelWithdrawalAction(_previous: WithdrawalActionState, formData: FormData): Promise<WithdrawalActionState> {
  try {
    const withdrawalId = String(formData.get("withdrawalId") ?? "");
    const result = await cancelWithdrawalRequest(withdrawalId);
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `Withdrawal of ₹${result.amount.toFixed(2)} was cancelled.` };
  } catch (error) {
    return { ok: false, message: formatWithdrawalError(error) };
  }
}
