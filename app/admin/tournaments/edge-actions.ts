"use server";

import { revalidatePath } from "next/cache";
import {
  abandonMatch,
  cancelMatch,
  cancelTournament,
  correctBracketSlot,
  correctMatchResult,
  markNoShow,
  resolveDispute,
} from "@/lib/tournament-edge-cases";

export type EdgeActionState = { ok: boolean; message?: string };

function message(error: unknown) {
  if (!(error instanceof Error)) return "The operation could not be completed.";
  const safe: Record<string, string> = {
    INVALID_REASON: "A cancellation/action reason is required.",
    TOURNAMENT_NOT_FOUND: "Tournament not found.",
    MATCH_NOT_FOUND: "Match not found.",
    MATCH_ALREADY_COMPLETED: "The completed match cannot be cancelled.",
    MATCH_NOT_ELIGIBLE: "This action is not valid for the current match state.",
    PARTICIPANT_NOT_ASSIGNED: "Participant not assigned.",
    RESULT_NOT_CORRECTABLE: "This result is not available for correction.",
    INVALID_RESULT: "The supplied result is invalid.",
    MATCH_NOT_CORRECTABLE: "This match cannot be corrected in its current state.",
    REGISTRATION_NOT_ELIGIBLE: "Participant is not eligible for this bracket slot.",
    REGISTRATION_ALREADY_ASSIGNED: "Participant is already assigned elsewhere in this bracket.",
    SLOT_NOT_FOUND: "Bracket slot not found.",
  };
  return safe[error.message] ?? "The operation could not be completed. Please refresh and try again.";
}

export async function cancelTournamentAction(_state: EdgeActionState, formData: FormData): Promise<EdgeActionState> {
  try { const id = String(formData.get("tournamentId") ?? ""); const reason = String(formData.get("reason") ?? ""); const result = await cancelTournament(id, reason); revalidatePath("/admin/tournaments"); revalidatePath(`/admin/tournaments/${id}`); return { ok: true, message: result.alreadyDone ? "Tournament was already cancelled." : "Tournament cancelled." }; }
  catch (error) { return { ok: false, message: message(error) }; }
}

export async function cancelMatchAction(_state: EdgeActionState, formData: FormData): Promise<EdgeActionState> {
  try { const id = String(formData.get("matchId") ?? ""); const result = await cancelMatch(id, String(formData.get("reason") ?? "")); revalidatePath(`/admin/tournaments/${String(formData.get("tournamentId") ?? "")}/bracket`); return { ok: true, message: result.alreadyDone ? "Match was already cancelled." : "Match cancelled." }; }
  catch (error) { return { ok: false, message: message(error) }; }
}

export async function markNoShowAction(_state: EdgeActionState, formData: FormData): Promise<EdgeActionState> {
  try { const id = String(formData.get("matchId") ?? ""); const result = await markNoShow(id, String(formData.get("registrationId") ?? ""), String(formData.get("reason") ?? "")); revalidatePath(`/admin/tournaments/${String(formData.get("tournamentId") ?? "")}/bracket`); return { ok: true, message: result.alreadyDone ? "Participant was already marked no-show." : "Participant marked no-show." }; }
  catch (error) { return { ok: false, message: message(error) }; }
}

export async function abandonMatchAction(_state: EdgeActionState, formData: FormData): Promise<EdgeActionState> {
  try { const id = String(formData.get("matchId") ?? ""); await abandonMatch(id, String(formData.get("reason") ?? "")); revalidatePath(`/admin/tournaments/${String(formData.get("tournamentId") ?? "")}/bracket`); return { ok: true, message: "Match marked abandoned." }; }
  catch (error) { return { ok: false, message: message(error) }; }
}

export async function resolveDisputeAction(_state: EdgeActionState, formData: FormData): Promise<EdgeActionState> {
  try { const matchId = String(formData.get("matchId") ?? ""); await resolveDispute(matchId, String(formData.get("resultId") ?? ""), String(formData.get("resolution") ?? "") === "REJECT" ? "REJECT" : "VERIFY", String(formData.get("reason") ?? "")); revalidatePath(`/admin/tournaments/${String(formData.get("tournamentId") ?? "")}/bracket`); return { ok: true, message: "Dispute resolved." }; }
  catch (error) { return { ok: false, message: message(error) }; }
}

export async function correctResultAction(_state: EdgeActionState, formData: FormData): Promise<EdgeActionState> {
  try { const matchId = String(formData.get("matchId") ?? ""); const raw = JSON.parse(String(formData.get("result") ?? "{}")); await correctMatchResult(matchId, String(formData.get("resultId") ?? ""), raw, String(formData.get("reason") ?? "")); revalidatePath(`/admin/tournaments/${String(formData.get("tournamentId") ?? "")}/bracket`); return { ok: true, message: "Result corrected and audited." }; }
  catch (error) { return { ok: false, message: message(error) }; }
}

export async function correctBracketSlotAction(_state: EdgeActionState, formData: FormData): Promise<EdgeActionState> {
  try { const matchId = String(formData.get("matchId") ?? ""); const registrationId = String(formData.get("registrationId") ?? "").trim() || null; await correctBracketSlot(matchId, Number(formData.get("slotNumber")), registrationId, String(formData.get("reason") ?? "")); revalidatePath(`/admin/tournaments/${String(formData.get("tournamentId") ?? "")}/bracket`); return { ok: true, message: "Bracket slot corrected and audited." }; }
  catch (error) { return { ok: false, message: message(error) }; }
}
