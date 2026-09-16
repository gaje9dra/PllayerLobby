"use server";

import { revalidatePath } from "next/cache";
import { generateTournamentBracket } from "@/lib/brackets";

export async function generateBracketAction(tournamentId: string) {
  try {
    const result = await generateTournamentBracket(tournamentId);
    revalidatePath(`/admin/tournaments/${tournamentId}/bracket`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "BRACKET_GENERATION_FAILED";
    throw new Error(message);
  }
}
