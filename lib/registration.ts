import "server-only";

import { Prisma, RegistrationStatus, WalletTransactionType } from "@/app/generated/prisma/client";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTournamentLifecycle } from "@/lib/tournament-lifecycle";
import { createRegistrationCodeData } from "@/lib/registration-code";
import {
  evaluateRegistrationEligibility,
  REGISTRATION_ELIGIBILITY_REASONS,
  type RegistrationEligibilityReason,
} from "@/lib/registration-eligibility-rules";
import { normalizeMoney } from "@/lib/wallet-rules";
import { recordWalletTransactionInTransaction } from "@/lib/wallet";
import { consumeSecurityRateLimit } from "@/lib/security-rate-limit";

export const REGISTRATION_RESULT_CODES = {
  ...REGISTRATION_ELIGIBILITY_REASONS,
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  WALLET_UNAVAILABLE: "WALLET_UNAVAILABLE",
  REGISTRATION_NOT_REOPENABLE: "REGISTRATION_NOT_REOPENABLE",
  RATE_LIMITED: "RATE_LIMITED",
  REGISTRATION_FAILED: "REGISTRATION_FAILED",
} as const;

export type RegistrationResultCode =
  (typeof REGISTRATION_RESULT_CODES)[keyof typeof REGISTRATION_RESULT_CODES];

export type RegistrationCreationResult =
  | {
      ok: true;
      registrationId: string;
      registrationStatus: RegistrationStatus;
      paymentRequired: false;
      walletBalance: string;
      entryFee: string;
      registrationCode?: string;
    }
  | {
      ok: false;
      code: RegistrationResultCode;
      message: string;
    };

type RegistrationUser = Pick<CurrentUser, "id" | "role" | "status">;

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
const SERIALIZABLE_RETRY_LIMIT = 8;

function isUniqueConstraintError(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "P2002";
}

function isTransactionConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /TransactionWriteConflict|could not serialize access|serialization failure/i.test(message);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export async function createTournamentRegistrationForUser(
  user: RegistrationUser,
  tournamentId: string,
): Promise<RegistrationCreationResult> {
  if (!UUID_PATTERN.test(tournamentId)) {
    return { ok: false, code: REGISTRATION_RESULT_CODES.TOURNAMENT_NOT_FOUND, message: ERROR_MESSAGES.TOURNAMENT_NOT_FOUND };
  }

  const rateLimit = await consumeSecurityRateLimit({
    namespace: "tournament-entry",
    key: `${user.id}:${tournamentId}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rateLimit.allowed) {
    return { ok: false, code: REGISTRATION_RESULT_CODES.RATE_LIMITED, message: "Too many join attempts. Please wait a moment and try again." };
  }

  try {
    await refreshTournamentLifecycle(tournamentId);

    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          const lockedRows = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "Tournament" WHERE "id" = CAST(${tournamentId} AS UUID) FOR UPDATE
          `;
          if (lockedRows.length === 0) {
            return { ok: false, code: REGISTRATION_RESULT_CODES.TOURNAMENT_NOT_FOUND, message: ERROR_MESSAGES.TOURNAMENT_NOT_FOUND };
          }

          const [tournament, registration, confirmedParticipants] = await Promise.all([
            tx.tournament.findUnique({
              where: { id: tournamentId },
              select: { id: true, entryFee: true, status: true, registrationStartTime: true, registrationEndTime: true, maxParticipants: true },
            }),
            tx.registration.findUnique({
              where: { userId_tournamentId: { userId: user.id, tournamentId } },
              select: { id: true, status: true },
            }),
            tx.registration.count({ where: { tournamentId, status: RegistrationStatus.CONFIRMED } }),
          ]);

          const eligibility = evaluateRegistrationEligibility({ user, tournament, registration, confirmedParticipants, now: new Date() });
          if (!eligibility.allowed) {
            return { ok: false, code: eligibility.reason, message: ERROR_MESSAGES[eligibility.reason] };
          }

          const entryFee = normalizeMoney(tournament!.entryFee.toFixed(2));
          if (!entryFee) throw new Error("Invalid tournament entry fee.");
          const isFree = entryFee === "0.00";

          if (registration?.status === RegistrationStatus.CANCELLED && !isFree) {
            const priorEntryDebit = await tx.walletTransaction.findFirst({
              where: { referenceType: "ENTRY_PAYMENT", referenceId: registration.id, type: WalletTransactionType.DEBIT, category: "ENTRY_FEE" },
              select: { id: true },
            });
            if (priorEntryDebit) {
              return { ok: false, code: REGISTRATION_RESULT_CODES.REGISTRATION_NOT_REOPENABLE, message: "This cancelled paid registration cannot be reactivated without the existing refund workflow." };
            }
          }

          let registrationId: string;
          if (registration?.status === RegistrationStatus.CANCELLED) {
            const updated = await tx.registration.update({
              where: { userId_tournamentId: { userId: user.id, tournamentId } },
              data: { status: isFree ? RegistrationStatus.CONFIRMED : RegistrationStatus.PENDING },
              select: { id: true },
            });
            registrationId = updated.id;
          } else {
            const created = await tx.registration.create({
              data: { tournamentId, userId: user.id, status: isFree ? RegistrationStatus.CONFIRMED : RegistrationStatus.PENDING },
              select: { id: true },
            });
            registrationId = created.id;
          }

          if (!isFree) {
            const wallet = await tx.wallet.findUnique({ where: { userId: user.id }, select: { id: true } });
            if (!wallet) throw new Error("Wallet unavailable.");

            await recordWalletTransactionInTransaction(tx, {
              walletId: wallet.id,
              type: "DEBIT",
              category: "ENTRY_FEE",
              amount: entryFee,
              currency: "INR",
              referenceType: "ENTRY_PAYMENT",
              referenceId: registrationId,
              description: `Tournament entry ${tournamentId}`,
            });

            await tx.registration.update({ where: { id: registrationId }, data: { status: RegistrationStatus.CONFIRMED } });
          }

          const codeData = createRegistrationCodeData();
          await tx.registrationCode.upsert({
            where: { registrationId },
            create: { registrationId, codeHash: codeData.codeHash, codeEncrypted: codeData.codeEncrypted },
            update: { codeHash: codeData.codeHash, codeEncrypted: codeData.codeEncrypted, revokedAt: null },
          });

          const wallet = await tx.wallet.findUnique({ where: { userId: user.id }, select: { balance: true } });

          return {
            ok: true,
            registrationId,
            registrationStatus: RegistrationStatus.CONFIRMED,
            paymentRequired: false,
            walletBalance: wallet?.balance.toString() ?? "0.00",
            entryFee,
            registrationCode: codeData.code,
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      } catch (error) {
        if (!isTransactionConflict(error) || attempt === SERIALIZABLE_RETRY_LIMIT) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
      }
    }

    throw new Error("Registration transaction retry limit reached.");
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, code: REGISTRATION_RESULT_CODES.ALREADY_REGISTERED, message: ERROR_MESSAGES.ALREADY_REGISTERED };
    }
    const message = errorMessage(error);
    if (message === "Insufficient wallet balance.") return { ok: false, code: REGISTRATION_RESULT_CODES.INSUFFICIENT_BALANCE, message: "Insufficient wallet balance." };
    if (message === "Wallet unavailable.") return { ok: false, code: REGISTRATION_RESULT_CODES.WALLET_UNAVAILABLE, message: "Your wallet is currently unavailable. Please try again." };
    console.error("Tournament registration failed:", error);
    return { ok: false, code: REGISTRATION_RESULT_CODES.REGISTRATION_FAILED, message: "Unable to register for this tournament right now. Please try again." };
  }
}

export async function createTournamentRegistration(tournamentId: string): Promise<RegistrationCreationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: REGISTRATION_RESULT_CODES.UNAUTHENTICATED, message: ERROR_MESSAGES.UNAUTHENTICATED };
  return createTournamentRegistrationForUser(user, tournamentId);
}