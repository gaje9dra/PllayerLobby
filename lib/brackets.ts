import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";
import { buildSingleEliminationPlan, type BracketParticipant } from "@/lib/bracket-plan";
import { canGenerateBracket, validateGenerationParticipantCount } from "@/lib/bracket-rules";

type BracketRow = { id: string; tournamentId: string; format: string; status: string; createdAt: Date; updatedAt: Date };
type RoundRow = { id: string; bracketId: string; roundNumber: number; name: string; status: string };
type MatchRow = { id: string; roundId: string; matchNumber: number; status: string; winnerSlot: number | null; winnerRegistrationId: string | null; scheduledTime: Date | null; nextMatchId: string | null; nextSlot: number | null };
type SlotRow = { id: string; matchId: string; slotNumber: number; registrationId: string | null; seed: number | null; isBye: boolean; sourceMatchId: string | null; sourceSlot: number | null; participantName?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new Error(`INVALID_${label.toUpperCase()}`);
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function generateTournamentBracket(tournamentId: string) {
  const admin = await requireAdmin();
  assertUuid(tournamentId, "tournament_id");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bracket:${tournamentId}`}, 0))`);

    const existing = await tx.$queryRaw<BracketRow[]>(Prisma.sql`
      SELECT "id", "tournamentId", "format", "status", "createdAt", "updatedAt"
      FROM "TournamentBracket"
      WHERE "tournamentId" = ${tournamentId}::uuid
      LIMIT 1
    `);
    if (existing[0]) return { created: false, bracketId: existing[0].id };

    const tournaments = await tx.$queryRaw<{ id: string; status: string; maxParticipants: number | null }[]>(Prisma.sql`
      SELECT "id", "status", "maxParticipants"
      FROM "Tournament"
      WHERE "id" = ${tournamentId}::uuid
      FOR UPDATE
    `);
    const tournament = tournaments[0];
    if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
    if (!canGenerateBracket(tournament.status)) throw new Error("TOURNAMENT_STATE_NOT_ALLOWED");

    const registrations = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id"
      FROM "Registration"
      WHERE "tournamentId" = ${tournamentId}::uuid
        AND "status" = 'CONFIRMED'
      ORDER BY "createdAt" ASC, "id" ASC
    `);
    validateGenerationParticipantCount(registrations.length, tournament.maxParticipants);

    const randomized = shuffle(registrations.map((row) => row.id));
    const participants: BracketParticipant[] = randomized.map((registrationId, index) => ({ registrationId, seed: index + 1 }));
    const plan = buildSingleEliminationPlan(participants);
    const bracketId = crypto.randomUUID();

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TournamentBracket" ("id", "tournamentId", "format", "status", "createdAt", "updatedAt")
      VALUES (${bracketId}::uuid, ${tournamentId}::uuid, 'SINGLE_ELIMINATION', 'GENERATED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const matchIds = new Map<string, string>();
    for (const round of plan) {
      const roundId = crypto.randomUUID();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TournamentBracketRound" ("id", "bracketId", "roundNumber", "name", "status", "createdAt", "updatedAt")
        VALUES (${roundId}::uuid, ${bracketId}::uuid, ${round.roundNumber}, ${round.name}, ${round.roundNumber === 1 ? "ACTIVE" : "PENDING"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      for (const match of round.matches) {
        const matchId = crypto.randomUUID();
        matchIds.set(`${round.roundNumber}:${match.matchNumber}`, matchId);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "TournamentBracketMatch" ("id", "roundId", "matchNumber", "status", "createdAt", "updatedAt")
          VALUES (${matchId}::uuid, ${roundId}::uuid, ${match.matchNumber}, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
      }
    }

    for (const round of plan) {
      for (const match of round.matches) {
        const matchId = matchIds.get(`${round.roundNumber}:${match.matchNumber}`)!;
        for (let slotIndex = 0; slotIndex < 2; slotIndex += 1) {
          const slot = match.slots[slotIndex];
          const sourceMatchId = slot.sourceMatchNumber ? matchIds.get(`${round.roundNumber - 1}:${slot.sourceMatchNumber}`) ?? null : null;
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "TournamentBracketSlot" ("id", "bracketId", "matchId", "slotNumber", "registrationId", "seed", "isBye", "sourceMatchId", "sourceSlot", "createdAt", "updatedAt")
            VALUES (
              ${crypto.randomUUID()}::uuid,
              ${bracketId}::uuid,
              ${matchId}::uuid,
              ${slotIndex + 1},
              ${slot.registrationId ? Prisma.sql`${slot.registrationId}::uuid` : Prisma.sql`NULL`},
              ${slot.seed},
              ${slot.isBye},
              ${sourceMatchId ? Prisma.sql`${sourceMatchId}::uuid` : Prisma.sql`NULL`},
              ${slot.sourceMatchNumber ? (slotIndex === 0 ? 1 : 2) : Prisma.sql`NULL`},
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
          `);
        }
      }
    }

    for (const round of plan.slice(0, -1)) {
      for (const match of round.matches) {
        const matchId = matchIds.get(`${round.roundNumber}:${match.matchNumber}`)!;
        const nextMatchNumber = Math.ceil(match.matchNumber / 2);
        const nextSlot = match.matchNumber % 2 === 1 ? 1 : 2;
        const nextMatchId = matchIds.get(`${round.roundNumber + 1}:${nextMatchNumber}`)!;
        await tx.$executeRaw(Prisma.sql`
          UPDATE "TournamentBracketMatch"
          SET "nextMatchId" = ${nextMatchId}::uuid, "nextSlot" = ${nextSlot}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${matchId}::uuid
        `);
      }
    }

    await recordAdminAuditEventInTransaction(tx, admin.id, {
      action: "BRACKET_GENERATED",
      targetType: "TOURNAMENT_BRACKET",
      targetId: bracketId,
      metadata: { tournamentId, format: "SINGLE_ELIMINATION", participantCount: participants.length, roundCount: plan.length, matchCount: plan.reduce((total, round) => total + round.matches.length, 0) },
    });

    return { created: true, bracketId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getTournamentBracket(tournamentId: string) {
  assertUuid(tournamentId, "tournament_id");
  const brackets = await prisma.$queryRaw<BracketRow[]>(Prisma.sql`
    SELECT "id", "tournamentId", "format", "status", "createdAt", "updatedAt"
    FROM "TournamentBracket"
    WHERE "tournamentId" = ${tournamentId}::uuid
    LIMIT 1
  `);
  const bracket = brackets[0];
  if (!bracket) return null;
  const rounds = await prisma.$queryRaw<RoundRow[]>(Prisma.sql`
    SELECT "id", "bracketId", "roundNumber", "name", "status"
    FROM "TournamentBracketRound"
    WHERE "bracketId" = ${bracket.id}::uuid
    ORDER BY "roundNumber" ASC
  `);
  const matches = await prisma.$queryRaw<MatchRow[]>(Prisma.sql`
    SELECT "id", "roundId", "matchNumber", "status", "winnerSlot", "winnerRegistrationId", "scheduledTime", "nextMatchId", "nextSlot"
    FROM "TournamentBracketMatch"
    WHERE "roundId" IN (SELECT "id" FROM "TournamentBracketRound" WHERE "bracketId" = ${bracket.id}::uuid)
    ORDER BY "roundId" ASC, "matchNumber" ASC
  `);
  const slots = await prisma.$queryRaw<SlotRow[]>(Prisma.sql`
    SELECT s."id", s."matchId", s."slotNumber", s."registrationId", s."seed", s."isBye", s."sourceMatchId", s."sourceSlot", u."name" AS "participantName"
    FROM "TournamentBracketSlot" s
    LEFT JOIN "Registration" r ON r."id" = s."registrationId"
    LEFT JOIN "User" u ON u."id" = r."userId"
    WHERE s."bracketId" = ${bracket.id}::uuid
    ORDER BY s."matchId" ASC, s."slotNumber" ASC
  `);
  return { bracket, rounds, matches, slots };
}

export async function getPublicTournamentBracketBySlug(slug: string) {
  if (!slug || slug.length > 160) return null;
  const tournaments = await prisma.$queryRaw<{ id: string; name: string; slug: string }[]>(Prisma.sql`
    SELECT t."id", t."name", t."slug"
    FROM "Tournament" t
    INNER JOIN "Game" g ON g."id" = t."gameId"
    WHERE t."slug" = ${slug}
      AND t."status" IN ('UPCOMING','REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','COMPLETED')
      AND g."isActive" = true
    LIMIT 1
  `);
  const tournament = tournaments[0];
  if (!tournament) return null;
  const bracket = await getTournamentBracket(tournament.id);
  if (!bracket) return null;
  return { tournament, ...bracket };
}
