import "server-only";

import {
  RegistrationStatus,
  TournamentStatus,
  UserRole,
  UserStatus,
} from "@/app/generated/prisma/client";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const REGISTRATION_ELIGIBILITY_REASONS = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  USER_NOT_ACTIVE: "USER_NOT_ACTIVE",
  USER_ROLE_NOT_ALLOWED: "USER_ROLE_NOT_ALLOWED",
  TOURNAMENT_NOT_FOUND: "TOURNAMENT_NOT_FOUND",
  REGISTRATION_NOT_OPEN: "REGISTRATION_NOT_OPEN",
  REGISTRATION_NOT_STARTED: "REGISTRATION_NOT_STARTED",
  REGISTRATION_CLOSED: "REGISTRATION_CLOSED",
  TOURNAMENT_FULL: "TOURNAMENT_FULL",
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
} as const;

export type RegistrationEligibilityReason =
  (typeof REGISTRATION_ELIGIBILITY_REASONS)[keyof typeof REGISTRATION_ELIGIBILITY_REASONS];

export type RegistrationEligibilityResult =
  | { allowed: true }
  | { allowed: false; reason: RegistrationEligibilityReason };

export type RegistrationCapacity = {
  maxParticipants: number | null;
  confirmedParticipants: number;
  remainingSlots: number | null;
};

type EligibilityTournament = {
  status: TournamentStatus;
  registrationStartTime: Date | null;
  registrationEndTime: Date | null;
  maxParticipants: number | null;
};

type EligibilityRegistration = {
  status: RegistrationStatus;
} | null;

export function evaluateRegistrationEligibility({
  user,
  tournament,
  registration,
  confirmedParticipants,
  now,
}: {
  user: Pick<CurrentUser, "role" | "status"> | null;
  tournament: EligibilityTournament | null;
  registration: EligibilityRegistration;
  confirmedParticipants: number;
  now: Date;
}): RegistrationEligibilityResult {
  if (!user) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.UNAUTHENTICATED };
  }

  if (user.status !== UserStatus.ACTIVE) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.USER_NOT_ACTIVE };
  }

  if (user.role !== UserRole.USER) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.USER_ROLE_NOT_ALLOWED };
  }

  if (!tournament) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.TOURNAMENT_NOT_FOUND };
  }

  if (tournament.status !== TournamentStatus.REGISTRATION_OPEN) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_NOT_OPEN };
  }

  if (!tournament.registrationStartTime || now < tournament.registrationStartTime) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_NOT_STARTED };
  }

  if (!tournament.registrationEndTime || now >= tournament.registrationEndTime) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_CLOSED };
  }

  if (registration && registration.status !== RegistrationStatus.CANCELLED) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.ALREADY_REGISTERED };
  }

  if (tournament.maxParticipants !== null && confirmedParticipants >= tournament.maxParticipants) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.TOURNAMENT_FULL };
  }

  return { allowed: true };
}

export function getRemainingSlots(maxParticipants: number | null, confirmedParticipants: number) {
  if (maxParticipants === null) return null;
  return Math.max(maxParticipants - confirmedParticipants, 0);
}

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
