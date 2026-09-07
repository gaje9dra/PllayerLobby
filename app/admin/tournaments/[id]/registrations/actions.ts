"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RegistrationStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAdminCancelRegistration } from "@/lib/admin-registration-rules";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export type CancelRegistrationState = {
  ok: boolean;
  error?: string;
};

export async function cancelRegistration(
  _previousState: CancelRegistrationState,
  formData: FormData,
): Promise<CancelRegistrationState> {
  await requireAdmin();

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");

  if (!isUuid(tournamentId) || !isUuid(registrationId)) {
    return { ok: false, error: "Invalid registration or tournament identifier." };
  }

  const existing = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      tournamentId: true,
      status: true,
      tournament: { select: { id: true, status: true } },
    },
  });

  if (!existing || existing.tournamentId !== tournamentId || existing.tournament.id !== tournamentId) {
    return { ok: false, error: "Registration not found for this tournament." };
  }

  if (!canAdminCancelRegistration(existing.tournament.status, existing.status)) {
    if (existing.tournament.status === TournamentStatus.COMPLETED) {
      return { ok: false, error: "Registrations cannot be cancelled after a tournament is completed." };
    }
    if (existing.tournament.status === TournamentStatus.CANCELLED) {
      return { ok: false, error: "Registrations cannot be changed for a cancelled tournament." };
    }
    return { ok: false, error: "This registration is already cancelled." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.registration.updateMany({
        where: {
          id: registrationId,
          tournamentId,
          status: {
            in: [RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED],
          },
        },
        data: { status: RegistrationStatus.CANCELLED },
      });

      if (result.count !== 1) {
        throw new Error("REGISTRATION_CHANGED");
      }

      await tx.registrationCode.updateMany({
        where: { registrationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REGISTRATION_CHANGED") {
      return { ok: false, error: "The registration changed before it could be cancelled. Refresh and try again." };
    }

    console.error("Admin registration cancellation failed:", error);
    return { ok: false, error: "Unable to cancel the registration right now. Please try again." };
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/registrations`);
  revalidatePath(`/admin/tournaments/${tournamentId}/registrations/${registrationId}`);
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  redirect(`/admin/tournaments/${tournamentId}/registrations/${registrationId}?cancelled=1`);
}
