import "server-only";

import { RegistrationStatus } from "@/app/generated/prisma/client";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  evaluateRegistrationEligibility,
  getRemainingSlots,
  REGISTRATION_ELIGIBILITY_REASONS,
  type RegistrationCapacity,
  type RegistrationEligibilityResult,
} from "@/lib/registration-eligibility-rules";

export {
  evaluateRegistrationEligibility,
  getRemainingSlots,
  REGISTRATION_ELIGIBILITY_REASONS,
};
export type {
  RegistrationCapacity,
  RegistrationEligibilityReason,
  RegistrationEligibilityResult,
} from "@/lib/registration-eligibility-rules";

export async function getTournamentRegistrationCapacity(
  tournamentId: string,
): Promise<RegistrationCapacity | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { maxParticipants: true },
  });

  if (!tournament) return null;

  const confirmedParticipants = await prisma.registration.count({
    where: {
      tournamentId,
      status: RegistrationStatus.CONFIRMED,
    },
  });

  return {
    maxParticipants: tournament.maxParticipants,
    confirmedParticipants,
    remainingSlots: getRemainingSlots(tournament.maxParticipants, confirmedParticipants),
  };
}

export async function canCurrentUserRegisterForTournament(
  tournamentId: string,
  now = new Date(),
): Promise<RegistrationEligibilityResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.UNAUTHENTICATED };
  }

  return canRegisterForTournament(user, tournamentId, now);
}

export async function canRegisterForTournament(
  user: CurrentUser | null,
  tournamentId: string,
  now = new Date(),
): Promise<RegistrationEligibilityResult> {
  const [tournament, registration, confirmedParticipants] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        status: true,
        registrationStartTime: true,
        registrationEndTime: true,
        maxParticipants: true,
      },
    }),
    user
      ? prisma.registration.findUnique({
          where: {
            userId_tournamentId: {
              userId: user.id,
              tournamentId,
            },
          },
          select: { status: true },
        })
      : Promise.resolve(null),
    prisma.registration.count({
      where: {
        tournamentId,
        status: RegistrationStatus.CONFIRMED,
      },
    }),
  ]);

  return evaluateRegistrationEligibility({
    user,
    tournament,
    registration,
    confirmedParticipants,
    now,
  });
}
