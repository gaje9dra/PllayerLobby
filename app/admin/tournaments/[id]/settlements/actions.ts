"use server";

import { revalidatePath } from "next/cache";
import { approvePrizeSettlement, cancelPrizeSettlement, generatePrizeSettlements } from "@/lib/tournament-prize-settlement";
import { creditApprovedPrizeSettlement, PrizeSettlementWalletError } from "@/lib/prize-settlement-wallet";

export async function generateSettlementsAction(formData: FormData) {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  try { const result = await generatePrizeSettlements(tournamentId); revalidatePath(`/admin/tournaments/${tournamentId}/settlements`); return { ok: true, message: `Generated ${result.created} settlement${result.created === 1 ? "" : "s"}. ${result.existing} already existed.` }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to generate settlements." }; }
}

export async function approveSettlementAction(formData: FormData) {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const settlementId = String(formData.get("settlementId") ?? "");
  try { await approvePrizeSettlement(tournamentId, settlementId); revalidatePath(`/admin/tournaments/${tournamentId}/settlements`); return { ok: true, message: "Settlement approved. No wallet credit has been made." }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to approve settlement." }; }
}

export async function cancelSettlementAction(formData: FormData) {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const settlementId = String(formData.get("settlementId") ?? "");
  try { await cancelPrizeSettlement(tournamentId, settlementId); revalidatePath(`/admin/tournaments/${tournamentId}/settlements`); return { ok: true, message: "Settlement cancelled and preserved in history." }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to cancel settlement." }; }
}

export async function creditSettlementToWalletAction(formData: FormData) {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const settlementId = String(formData.get("settlementId") ?? "");
  try {
    const result = await creditApprovedPrizeSettlement(settlementId);
    revalidatePath(`/admin/tournaments/${tournamentId}/settlements`);
    revalidatePath("/dashboard/wallet");
    return { ok: true, message: "Prize settlement credited successfully.", code: "CREDITED", balance: result.wallet.balance };
  } catch (error) {
    if (error instanceof PrizeSettlementWalletError) return { ok: false, message: error.message, code: error.code };
    return { ok: false, message: "Unable to credit prize settlement. No financial changes were committed.", code: "FINANCIAL_RECONCILIATION_FAILED" };
  }
}
