"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createTournamentPrize, deleteTournamentPrize, finalizePrizeConfiguration, updateTournamentPrize } from "@/lib/tournament-prize";

function tournamentPath(tournamentId: string) {
  return `/admin/tournaments/${tournamentId}/prizes`;
}

export async function createPrizeAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  await createTournamentPrize(tournamentId, String(formData.get("rank") ?? ""), String(formData.get("amount") ?? ""));
  revalidatePath(tournamentPath(tournamentId));
}

export async function updatePrizeAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  await updateTournamentPrize(tournamentId, String(formData.get("prizeId") ?? ""), String(formData.get("rank") ?? ""), String(formData.get("amount") ?? ""));
  revalidatePath(tournamentPath(tournamentId));
}

export async function deletePrizeAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  await deleteTournamentPrize(tournamentId, String(formData.get("prizeId") ?? ""));
  revalidatePath(tournamentPath(tournamentId));
}

export async function finalizePrizesAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  await finalizePrizeConfiguration(tournamentId);
  revalidatePath(tournamentPath(tournamentId));
}
