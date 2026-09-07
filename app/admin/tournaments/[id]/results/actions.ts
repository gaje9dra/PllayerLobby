"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TournamentResultStatus } from "@/app/generated/prisma/client";
import { createTournamentResult, disqualifyTournamentResult, updateTournamentResult, verifyTournamentResult } from "@/lib/tournament-result";

export type ResultActionState = { ok: boolean; message?: string };

export async function createResultAction(_state: ResultActionState, formData: FormData): Promise<ResultActionState> {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");
  const result = await createTournamentResult(tournamentId, registrationId, String(formData.get("rank") ?? ""), String(formData.get("score") ?? ""));
  if (!result.ok) return result;
  revalidatePath(`/admin/tournaments/${tournamentId}/results`);
  return { ok: true, message: "Draft result saved." };
}

export async function updateResultAction(_state: ResultActionState, formData: FormData): Promise<ResultActionState> {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const resultId = String(formData.get("resultId") ?? "");
  const result = await updateTournamentResult(tournamentId, resultId, String(formData.get("rank") ?? ""), String(formData.get("score") ?? ""));
  if (!result.ok) return result;
  revalidatePath(`/admin/tournaments/${tournamentId}/results`);
  return { ok: true, message: "Draft result updated." };
}

async function transitionAction(formData: FormData, target: TournamentResultStatus): Promise<ResultActionState> {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const resultId = String(formData.get("resultId") ?? "");
  const result = target === TournamentResultStatus.VERIFIED ? await verifyTournamentResult(tournamentId, resultId) : await disqualifyTournamentResult(tournamentId, resultId);
  if (!result.ok) return result;
  revalidatePath(`/admin/tournaments/${tournamentId}/results`);
  return { ok: true, message: target === TournamentResultStatus.VERIFIED ? "Result verified." : "Result disqualified." };
}

export async function verifyResultAction(formData: FormData) {
  const result = await transitionAction(formData, TournamentResultStatus.VERIFIED);
  if (!result.ok) return result;
  const tournamentId = String(formData.get("tournamentId") ?? "");
  redirect(`/admin/tournaments/${tournamentId}/results?verified=1`);
}

export async function disqualifyResultAction(formData: FormData) {
  const result = await transitionAction(formData, TournamentResultStatus.DISQUALIFIED);
  if (!result.ok) return result;
  const tournamentId = String(formData.get("tournamentId") ?? "");
  redirect(`/admin/tournaments/${tournamentId}/results?disqualified=1`);
}
