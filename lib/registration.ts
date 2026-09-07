import "server-only";

import { RegistrationStatus } from "@/app/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  evaluateRegistrationEligibility,
  REGISTRATION_ELIGIBILITY_REASONS,
  type RegistrationEligibilityReason,
} from "@/lib/registration-eligibility-rules";
import { getRegistrationCreationStatus } from "@/lib/registration-workflow-rules";

export const REGISTRATION_RESULT_CODES = {
  ...REGISTRATION_ELIGIBILITY_REASONS,
  REGISTRATION_FAILED: "REGISTRATION_FAILED",
} as const;

export type RegistrationResultCode =
  (typeof REGISTRATION_RESULT_CODES)[keyof typeof REGISTRATION_RESULT_CODES];

export type RegistrationCreationResult =
  | {
      ok: true;
      registrationStatus: RegistrationStatus;
      paymentRequired: boolean;
    }
  | {
      ok: false;
      code: RegistrationResultCode;
      message: string;
    };

const ERROR_MESSAGES: Record<RegistrationEligibilityReason, string> = {
  UNAUTHENTICATED: "Please sign in with Google to register for this tournament.",
  USER_NOT_ACTIVE: "Your account is not currently eligible to register.",
  USER_ROLE_NOT_ALLOWED: "This account is not eligible to register for tournaments.",
  TOURNAMENT_NOT_FOUND: "This tournament is no longer available.",
  REGISTRATION_NOT_OPEN: "Registration is not currently open for this tournament.",
  REGISTRATION_NOT_STARTED: "Registration has not started yet.",
  REGISTRATION_CLOSED: "Registration for this tournament is closed.",
  TOURNAMENT_FULL: "This tournament is currently full.",
  ALREADY_REGISTERED: "You already have an active registration for this tournament.",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUniqueConstraintError(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "P2002";
}

export async function createTournamentRegistration(
  tournamentId: string,
): Promise<RegistrationCreationResult> {
  if (!UUID_PATTERN.test(tournamentId)) {
    return {
      ok: false,
      code: REGISTRATION_RESULT_CODES.TOURNAMENT_NOT_FOUND,
      message: ERROR_MESSAGES.TOURNAMENT_NOT_FOUND,
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      code: REGISTRATION_RESULT_CODES.UNAUTHENTICATED,
      message: ERROR_MESSAGES.UNAUTHENTICATED,
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Tournament"
        WHERE "id" = CAST(${tournamentId} AS UUID)
        FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        return {
          ok: false,
          code: REGISTRATION_RESULT_CODES.TOURNAMENT_NOT_FOUND,
          message: ERROR_MESSAGES.TOURNAMENT_NOT_FOUND,
        };
      }

      const [tournament, registration, confirmedParticipants] = await Promise.all([
        tx.tournament.findUnique({
          where: { id: tournamentId },
          select: {
            id: true,
            entryFee: true,
            status: true,
            registrationStartTime: true,
            registrationEndTime: true,
            maxParticipants: true,
          },
        }),
        tx.registration.findUnique({
          where: {
            userId_tournamentId: {
              userId: user.id,
              tournamentId,
            },
          },
          select: { status: true },
        }),
        tx.registration.count({
          where: {
            tournamentId,
            status: RegistrationStatus.CONFIRMED,
          },
        }),
      ]);

      const eligibility = evaluateRegistrationEligibility({
        user,
        tournament,
        registration,
        confirmedParticipants,
        now: new Date(),
      });

      if (!eligibility.allowed) {
        return {
          ok: false,
          code: eligibility.reason,
          message: ERROR_MESSAGES[eligibility.reason],
        };
      }

      const creation = getRegistrationCreationStatus(tournament!.entryFee);

      if (registration?.status === RegistrationStatus.CANCELLED) {
        await tx.registration.update({
          where: {
            userId_tournamentId: {
              userId: user.id,
              tournamentId,
            },
          },
          data: { status: creation.status },
        });
      } else {
        await tx.registration.create({
          data: {
            tournamentId,
            userId: user.id,
            status: creation.status,
          },
        });
      }

      return {
        ok: true,
        registrationStatus: creation.status,
        paymentRequired: creation.paymentRequired,
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        ok: false,
        code: REGISTRATION_RESULT_CODES.ALREADY_REGISTERED,
        message: ERROR_MESSAGES.ALREADY_REGISTERED,
      };
    }

    console.error("Tournament registration failed:", error);
    return {
      ok: false,
      code: REGISTRATION_RESULT_CODES.REGISTRATION_FAILED,
      message: "Unable to register for this tournament right now. Please try again.",
    };
  }
}
