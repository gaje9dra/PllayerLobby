"use server";

import { revalidatePath } from "next/cache";
import { formatWithdrawalError, rejectWithdrawalRequest } from "@/lib/withdrawal";
import { approveWithdrawalRequestWithDestination, formatWithdrawalDestinationError } from "@/lib/withdrawal-destination";
import { formatManualPayoutError, markWithdrawalManuallyPaid } from "@/lib/manual-withdrawal-payout";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/auth";
import { consumeSecurityRateLimit } from "@/lib/security-rate-limit";

export type AdminWithdrawalActionState = { ok: boolean; message?: string };

function formatAdminError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const manualCodes = ["INVALID_MANUAL_PAYMENT_REFERENCE", "WITHDRAWAL_NOT_FOUND", "WITHDRAWAL_NOT_APPROVED", "MISSING_DESTINATION_SNAPSHOT", "CURRENCY_MISMATCH", "PAYOUT_ALREADY_EXISTS", "WALLET_INTEGRITY_ERROR", "INSUFFICIENT_WALLET_BALANCE"];
  if (manualCodes.includes(code)) return formatManualPayoutError(error);
  const destinationCodes = ["DESTINATION_OWNERSHIP_MISMATCH", "MISSING_DESTINATION_SNAPSHOT", "DESTINATION_DATA_CORRUPTED", "WITHDRAWAL_INTEGRITY_ERROR", "DESTINATION_NOT_VERIFIED", "DESTINATION_DISABLED", "DESTINATION_SNAPSHOT_MISMATCH", "USER_NOT_ACTIVE", "INSUFFICIENT_AVAILABLE_BALANCE", "WITHDRAWAL_NOT_PENDING"];
  return destinationCodes.includes(code) ? formatWithdrawalDestinationError(error) : formatWithdrawalError(error);
}

async function audit(action: string, targetId: string, metadata?: Record<string, unknown>) {
  try {
    await recordAdminAuditEvent({ action, targetType: "WITHDRAWAL", targetId, metadata });
  } catch (error) {
    console.error("Admin audit logging failed:", error instanceof Error ? error.name : "unknown");
  }
}

async function allowAdminWithdrawalAction() {
  const admin = await requireAdmin();
  const rateLimit = await consumeSecurityRateLimit({ namespace: "admin-manual-withdrawal", key: admin.id, limit: 20, windowSeconds: 60 });
  return rateLimit.allowed;
}

export async function approveWithdrawalAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    if (!(await allowAdminWithdrawalAction())) return { ok: false, message: "Too many withdrawal actions. Please wait and try again." };
    const id = String(formData.get("withdrawalId") ?? "");
    const result = await approveWithdrawalRequestWithDestination(id);
    await audit("WITHDRAWAL_APPROVED", id, { amount: result.amount.toFixed(2), currency: result.currency });
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `Withdrawal ₹${result.amount.toFixed(2)} approved. Send the payment manually, then record its transaction reference.` };
  } catch (error) { return { ok: false, message: formatAdminError(error) }; }
}

export async function rejectWithdrawalAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    if (!(await allowAdminWithdrawalAction())) return { ok: false, message: "Too many withdrawal actions. Please wait and try again." };
    const id = String(formData.get("withdrawalId") ?? "");
    const reason = String(formData.get("reason") ?? "");
    await rejectWithdrawalRequest(id, reason);
    await audit("WITHDRAWAL_REJECTED", id, { reason: reason.trim().slice(0, 1000) });
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: "Withdrawal rejected and its reserved amount is available again." };
  } catch (error) { return { ok: false, message: formatAdminError(error) }; }
}

export async function markManualWithdrawalPaidAction(_previous: AdminWithdrawalActionState, formData: FormData): Promise<AdminWithdrawalActionState> {
  try {
    if (!(await allowAdminWithdrawalAction())) return { ok: false, message: "Too many withdrawal actions. Please wait and try again." };
    const id = String(formData.get("withdrawalId") ?? "");
    const reference = String(formData.get("paymentReference") ?? "");
    const result = await markWithdrawalManuallyPaid(id, reference);
    await audit("MANUAL_WITHDRAWAL_PAID", id, { payoutId: result.id, amount: result.amount.toFixed(2), currency: result.currency, paymentReference: result.reference });
    revalidatePath("/admin/finance/withdrawals");
    revalidatePath("/admin/finance/wallets");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/wallet/withdraw");
    return { ok: true, message: `Manual payment recorded for ₹${result.amount.toFixed(2)}. Wallet ledger settled.` };
  } catch (error) { return { ok: false, message: formatAdminError(error) }; }
}
