"use server";

import { revalidatePath } from "next/cache";
import { RegistrationStatus } from "@/app/generated/prisma/client";
import { createTournamentRegistration } from "@/lib/registration";

export type RegistrationActionState = {
  ok: boolean;
  code?: string;
  message?: string;
  registrationId?: string;
  registrationStatus?: RegistrationStatus;
  paymentRequired?: boolean;
  walletBalance?: string;
  entryFee?: string;
  registrationCode?: string;
};

export async function registerForTournament(
  _previousState: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const tournamentId = String(formData.get("tournamentId") ?? "").trim();

  if (!tournamentId) {
    return {
      ok: false,
      code: "TOURNAMENT_NOT_FOUND",
      message: "This tournament is no longer available.",
    };
  }

  const result = await createTournamentRegistration(tournamentId);

  if (!result.ok) {
    return result;
  }

  revalidatePath("/tournaments");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/wallet");

  return result;
}
