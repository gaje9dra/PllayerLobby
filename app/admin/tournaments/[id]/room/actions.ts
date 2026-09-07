"use server";

import { revalidatePath } from "next/cache";
import { upsertTournamentRoom, revokeTournamentRoom } from "@/lib/tournament-room";

export type RoomActionState = { ok: boolean; message?: string };

export async function saveTournamentRoom(_previous: RoomActionState, formData: FormData): Promise<RoomActionState> {
  const result = await upsertTournamentRoom({
    tournamentId: String(formData.get("tournamentId") ?? ""),
    roomId: String(formData.get("roomId") ?? ""),
    roomPassword: String(formData.get("roomPassword") ?? ""),
    published: formData.get("published") === "on",
  });
  if (result.ok) {
    const tournamentId = String(formData.get("tournamentId") ?? "");
    revalidatePath(`/admin/tournaments/${tournamentId}/room`);
    revalidatePath(`/admin/tournaments/${tournamentId}`);
  }
  return result;
}

export async function disableTournamentRoom(_previous: RoomActionState, formData: FormData): Promise<RoomActionState> {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const result = await revokeTournamentRoom(tournamentId);
  if (result.ok) {
    revalidatePath(`/admin/tournaments/${tournamentId}/room`);
  }
  return result;
}
