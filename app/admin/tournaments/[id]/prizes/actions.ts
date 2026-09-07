"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createTournamentPrize, deleteTournamentPrize, finalizePrizeConfiguration, updateTournamentPrize } from "@/lib/tournament-prize";

export async function createPrizeAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  await createTournamentPrize(tournamentId, String(formData.get("rank") ?? ""), String(formData.get("amount") ?? ""));
  revalidatePath(`/admin/tournaments/${tournamentId}/prizes`);
}

export async function updatePrizeAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  await updateTournamentPrize(String(formData.get("prizeId") ?? ""), String(formData.get("rank") ?? ""), String(formData.get("amount") ?? ""));
  revalidatePath(`/admin/tournaments/${tournamentId}/prizes`);
}

export async function deletePrizeAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  await deleteTournamentPrize(String(formData.get("prizeId") ?? ""));
  revalidatePath(`/admin/tournaments/${tournamentId}/prizes`);
}

export async function finalizePrizesAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  await finalizePrizeConfiguration(tournamentId);
  revalidatePath(`/admin/tournaments/${tournamentId}/prizes`);
}
