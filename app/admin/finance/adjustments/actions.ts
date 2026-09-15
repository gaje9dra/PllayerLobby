"use server";

import { revalidatePath } from "next/cache";
import { createAdminWalletAdjustment } from "@/lib/admin-finance-tools";

export async function createAdjustmentAction(formData: FormData) {
  const walletId = String(formData.get("walletId") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  try {
    await createAdminWalletAdjustment({ walletId, amount, direction: direction as "CREDIT" | "DEBIT", reason, idempotencyKey });
    revalidatePath("/admin/finance");
    revalidatePath("/admin/finance/wallets");
    revalidatePath("/admin/finance/transactions");
    return { ok: true, message: "Adjustment recorded as a new ledger entry." };
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const messages: Record<string, string> = { INVALID_WALLET: "Invalid wallet.", INVALID_AMOUNT: "Enter a positive amount with at most 2 decimals.", INVALID_INPUT: "Reason or idempotency key is invalid.", INVALID_DIRECTION: "Invalid adjustment direction.", WALLET_NOT_FOUND: "Wallet not found or unsupported currency.", INSUFFICIENT_BALANCE: "Debit exceeds the current wallet balance.", IDEMPOTENCY_KEY_REUSED: "That idempotency key was already used with different adjustment terms.", RATE_LIMITED: "Adjustment rate limit reached. Try again later." };
    return { ok: false, message: messages[code] ?? "Adjustment failed safely. No ledger change was made." };
  }
}
