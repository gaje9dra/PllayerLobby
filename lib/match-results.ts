import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESULT_STATUSES = new Set(["PENDING", "VERIFIED", "REJECTED", "DISPUTED", "CANCELLED"]);
const FINAL_MATCH_STATUSES = new Set(["COMPLETED", "CANCELLED"]);
const SUBMITTABLE_MATCH_STATUSES = new Set(["READY", "LIVE"]);
const MAX_SCORE_KEYS = 4;

export type MatchScoreMap = Record<string, number>;

export function validateMatchResultInput(input: unknown): { winnerRegistrationId: string; scores: MatchScoreMap } {
  if (!input || typeof input !== "object") throw new Error("INVALID_RESULT");
  const body = input as { winnerRegistrationId?: unknown; scores?: unknown };
  if (typeof body.winnerRegistrationId !== "string" || !UUID.test(body.winnerRegistrationId)) throw new Error("INVALID_WINNER");
  if (!body.scores || typeof body.scores !== "object" || Array.isArray(body.scores)) throw new Error("INVALID_SCORE");
  const entries = Object.entries(body.scores as Record<string, unknown>);
  if (entries.length < 1 || entries.length > MAX_SCORE_KEYS) throw new Error("INVALID_SCORE");
  const scores: MatchScoreMap = {};
  for (const [registrationId, value] of entries) {
    if (!UUID.test(registrationId) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error("INVALID_SCORE");
    scores[registrationId] = value;
  }
  if (!Object.prototype.hasOwnProperty.call(scores, body.winnerRegistrationId)) throw new Error("INVALID_WINNER");
  return { winnerRegistrationId: body.winnerRegistrationId, scores };
}

export function validateResultStateTransition(current: string, next: string) {
  if (!RESULT_STATUSES.has(current) || !RESULT_STATUSES.has(next)) return false;
  if (current === "PENDING") return ["VERIFIED", "REJECTED", "DISPUTED", "CANCELLED"].includes(next);
  if (current === "DISPUTED") return ["VERIFIED", "REJECTED", "CANCELLED"].includes(next);
  return false;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "RESULT_OPERATION_FAILED";
}

async function getMatchContext(matchId: string, tx = prisma) {
  if (!UUID.test(matchId)) throw new Error("MATCH_NOT_FOUND");
  const rows = await tx.$queryRaw<Array<{
    matchId: string;
    matchStatus: string;
    roundId: string;
    roundNumber: number;
    matchNumber: number;
    nextMatchId: string | null;
    nextSlot: number | null;
    tournamentId: string;
    tournamentStatus: string;
    tournamentName: string;
  }>>(Prisma.sql`
    SELECT m."id" AS "matchId", m."status" AS "matchStatus", m."roundId", r."roundNumber", m."matchNumber",
           m."nextMatchId", m."nextSlot", b."tournamentId", t."status" AS "tournamentStatus", t."name" AS "tournamentName"
    FROM "TournamentBracketMatch" m
    INNER JOIN "TournamentBracketRound" r ON r."id" = m."roundId"
    INNER JOIN "TournamentBracket" b ON b."id" = r."bracketId"
    INNER JOIN "Tournament" t ON t."id" = b."tournamentId"
    WHERE m."id" = ${matchId}::uuid
    LIMIT 1
  `);
  if (!rows[0]) throw new Error("MATCH_NOT_FOUND");
  return rows[0];
}

async function getMatchParticipants(matchId: string, tx = prisma) {
  return tx.$queryRaw<Array<{ slotNumber: number; registrationId: string | null; participantName: string | null }>>(Prisma.sql`
    SELECT s."slotNumber", s."registrationId", u."name" AS "participantName"
    FROM "TournamentBracketSlot" s
    LEFT JOIN "Registration" r ON r."id" = s."registrationId"
    LEFT JOIN "User" u ON u."id" = r."userId"
    WHERE s."matchId" = ${matchId}::uuid
    ORDER BY s."slotNumber" ASC
  `);
}

export async function submitMatchResult(matchId: string, input: unknown) {
  const admin = await requireAdmin();
  const parsed = validateMatchResultInput(input);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`match-result:${matchId}`}, 0))`);
      const match = await getMatchContext(matchId, tx);
      if (FINAL_MATCH_STATUSES.has(match.matchStatus) || !SUBMITTABLE_MATCH_STATUSES.has(match.matchStatus)) throw new Error("MATCH_NOT_ELIGIBLE");
      if (["CANCELLED", "COMPLETED"].includes(match.tournamentStatus)) throw new Error("TOURNAMENT_NOT_ELIGIBLE");

      const participants = await getMatchParticipants(matchId, tx);
      const participantIds = new Set(participants.map((p) => p.registrationId).filter((id): id is string => Boolean(id)));
      if (participantIds.size < 2 || !participantIds.has(parsed.winnerRegistrationId)) throw new Error("INVALID_WINNER");
      for (const registrationId of Object.keys(parsed.scores)) if (!participantIds.has(registrationId)) throw new Error("INVALID_SCORE");

      const existing = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id", "status" FROM "MatchResult"
        WHERE "matchId" = ${matchId}::uuid AND "status" IN ('PENDING','DISPUTED')
        ORDER BY "createdAt" DESC LIMIT 1
      `);
      if (existing[0]) {
        throw new Error("RESULT_ALREADY_PENDING");
      }

      const id = crypto.randomUUID();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "MatchResult" ("id", "matchId", "submittedById", "status", "winnerRegistrationId", "scores", "submittedAt", "createdAt", "updatedAt")
        VALUES (${id}::uuid, ${matchId}::uuid, ${admin.id}::uuid, 'PENDING', ${parsed.winnerRegistrationId}::uuid, ${JSON.stringify(parsed.scores)}::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      await recordAdminAuditEventInTransaction(tx, admin.id, {
        action: "MATCH_RESULT_SUBMITTED",
        targetType: "TOURNAMENT_BRACKET_MATCH",
        targetId: matchId,
        metadata: { tournamentId: match.tournamentId, resultId: id },
      });
      return { ok: true, resultId: id, status: "PENDING" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function getMatchResult(matchId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Authentication required." };
  const match = await getMatchContext(matchId);
  const participants = await getMatchParticipants(matchId);
  const allowed = user.role === "ADMIN" || participants.some((p) => p.registrationId && p.registrationId === user.id);
  if (!allowed) {
    const registrations = await prisma.$queryRaw<Array<{ registrationId: string }>>(Prisma.sql`
      SELECT s."registrationId" FROM "TournamentBracketSlot" s INNER JOIN "Registration" r ON r."id" = s."registrationId" WHERE s."matchId" = ${matchId}::uuid AND r."userId" = ${user.id}::uuid LIMIT 1
    `);
    if (!registrations[0]) return { ok: false, message: "Access denied." };
  }
  const results = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT mr."id", mr."matchId", mr."status", mr."winnerRegistrationId", mr."scores", mr."submittedAt", mr."verifiedAt", mr."rejectionReason",
           su."name" AS "submitterName", vu."name" AS "verifierName"
    FROM "MatchResult" mr
    INNER JOIN "User" su ON su."id" = mr."submittedById"
    LEFT JOIN "User" vu ON vu."id" = mr."verifiedById"
    WHERE mr."matchId" = ${matchId}::uuid
    ORDER BY mr."createdAt" DESC
  `);
  return { ok: true, data: { match, participants, results } };
}

export async function listPendingMatchResults(tournamentId?: string) {
  await requireAdmin();
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT mr."id", mr."matchId", mr."status", mr."winnerRegistrationId", mr."scores", mr."submittedAt", mr."verifiedAt", mr."rejectionReason",
           t."id" AS "tournamentId", t."name" AS "tournamentName", m."matchNumber", r."roundNumber",
           su."name" AS "submitterName"
    FROM "MatchResult" mr
    INNER JOIN "TournamentBracketMatch" m ON m."id" = mr."matchId"
    INNER JOIN "TournamentBracketRound" r ON r."id" = m."roundId"
    INNER JOIN "TournamentBracket" b ON b."id" = r."bracketId"
    INNER JOIN "Tournament" t ON t."id" = b."tournamentId"
    INNER JOIN "User" su ON su."id" = mr."submittedById"
    WHERE mr."status" IN ('PENDING','DISPUTED')
      ${tournamentId && UUID.test(tournamentId) ? Prisma.sql`AND t."id" = ${tournamentId}::uuid` : Prisma.empty}
    ORDER BY mr."submittedAt" ASC
  `);
  return rows;
}

async function transitionMatchResult(matchId: string, resultId: string, action: "VERIFY" | "REJECT" | "DISPUTE", rejectionReason?: string) {
  const admin = await requireAdmin();
  if (!UUID.test(matchId) || !UUID.test(resultId)) throw new Error("INVALID_RESULT_REFERENCE");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`match-result:${matchId}`}, 0))`);
    const match = await getMatchContext(matchId, tx);
    const results = await tx.$queryRaw<Array<{ id: string; status: string; winnerRegistrationId: string | null; scores: unknown; submittedById: string }>>(Prisma.sql`
      SELECT "id", "status", "winnerRegistrationId", "scores", "submittedById" FROM "MatchResult" WHERE "id" = ${resultId}::uuid AND "matchId" = ${matchId}::uuid FOR UPDATE
    `);
    const result = results[0];
    if (!result) throw new Error("RESULT_NOT_FOUND");
    if (action === "VERIFY" && result.status !== "PENDING" && result.status !== "DISPUTED") throw new Error("INVALID_RESULT_STATE");
    if (action !== "VERIFY" && !validateResultStateTransition(result.status, action === "REJECT" ? "REJECTED" : "DISPUTED")) throw new Error("INVALID_RESULT_STATE");

    if (action === "VERIFY") {
      if (FINAL_MATCH_STATUSES.has(match.matchStatus) || !SUBMITTABLE_MATCH_STATUSES.has(match.matchStatus)) throw new Error("MATCH_NOT_ELIGIBLE");
      if (!result.winnerRegistrationId) throw new Error("INVALID_WINNER");
      const participants = await getMatchParticipants(matchId, tx);
      const participantIds = new Set(participants.map((p) => p.registrationId).filter((id): id is string => Boolean(id)));
      if (!participantIds.has(result.winnerRegistrationId)) throw new Error("INVALID_WINNER");

      await tx.$executeRaw(Prisma.sql`
        UPDATE "MatchResult" SET "status" = 'VERIFIED', "verifiedById" = ${admin.id}::uuid, "verifiedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${resultId}::uuid AND "status" IN ('PENDING','DISPUTED')
      `);
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "TournamentBracketMatch" SET "winnerRegistrationId" = ${result.winnerRegistrationId}::uuid, "winnerSlot" = (SELECT "slotNumber" FROM "TournamentBracketSlot" WHERE "matchId" = ${matchId}::uuid AND "registrationId" = ${result.winnerRegistrationId}::uuid LIMIT 1), "status" = 'COMPLETED', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${matchId}::uuid AND "status" IN ('READY','LIVE')
      `);
      if (updated !== 1) throw new Error("MATCH_FINALIZATION_CONFLICT");

      if (match.nextMatchId && match.nextSlot) {
        const target = await tx.$queryRaw<Array<{ registrationId: string | null }>>(Prisma.sql`SELECT "registrationId" FROM "TournamentBracketSlot" WHERE "matchId" = ${match.nextMatchId}::uuid AND "slotNumber" = ${match.nextSlot} FOR UPDATE`);
        if (!target[0]) throw new Error("NEXT_MATCH_SLOT_NOT_FOUND");
        if (target[0].registrationId && target[0].registrationId !== result.winnerRegistrationId) throw new Error("NEXT_MATCH_SLOT_CONFLICT");
        await tx.$executeRaw(Prisma.sql`UPDATE "TournamentBracketSlot" SET "registrationId" = ${result.winnerRegistrationId}::uuid, "updatedAt" = CURRENT_TIMESTAMP WHERE "matchId" = ${match.nextMatchId}::uuid AND "slotNumber" = ${match.nextSlot}`);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "TournamentBracketMatch" SET "status" = CASE WHEN (SELECT COUNT(*) FROM "TournamentBracketSlot" WHERE "matchId" = ${match.nextMatchId}::uuid AND "registrationId" IS NOT NULL) = 2 THEN 'READY' ELSE "status" END, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${match.nextMatchId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED')
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`UPDATE "Tournament" SET "winnerRegistrationId" = ${result.winnerRegistrationId}::uuid, "status" = 'COMPLETED', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${match.tournamentId}::uuid AND "status" <> 'CANCELLED'`);
      }

      await recordAdminAuditEventInTransaction(tx, admin.id, { action: "MATCH_RESULT_VERIFIED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { tournamentId: match.tournamentId, resultId, winnerRegistrationId: result.winnerRegistrationId } });
      await recordAdminAuditEventInTransaction(tx, admin.id, { action: "MATCH_WINNER_CONFIRMED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { tournamentId: match.tournamentId, resultId, winnerRegistrationId: result.winnerRegistrationId } });
      if (match.nextMatchId) await recordAdminAuditEventInTransaction(tx, admin.id, { action: "BRACKET_ADVANCED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: match.nextMatchId, metadata: { tournamentId: match.tournamentId, sourceMatchId: matchId, winnerRegistrationId: result.winnerRegistrationId, slot: match.nextSlot } });
      else await recordAdminAuditEventInTransaction(tx, admin.id, { action: "TOURNAMENT_WINNER_CONFIRMED", targetType: "TOURNAMENT", targetId: match.tournamentId, metadata: { resultId, winnerRegistrationId: result.winnerRegistrationId } });
      return { ok: true, status: "VERIFIED" as const, winnerRegistrationId: result.winnerRegistrationId };
    }

    const nextStatus = action === "REJECT" ? "REJECTED" : "DISPUTED";
    await tx.$executeRaw(Prisma.sql`UPDATE "MatchResult" SET "status" = ${nextStatus}, "rejectionReason" = ${action === "REJECT" ? (rejectionReason?.trim().slice(0, 1000) || "Result rejected by an administrator.") : null}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${resultId}::uuid`);
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: action === "REJECT" ? "MATCH_RESULT_REJECTED" : "MATCH_RESULT_DISPUTED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { tournamentId: match.tournamentId, resultId, reason: action === "REJECT" ? (rejectionReason?.trim().slice(0, 500) || "Result rejected by an administrator.") : undefined } });
    return { ok: true, status: nextStatus as "REJECTED" | "DISPUTED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const verifyMatchResult = (matchId: string, resultId: string) => transitionMatchResult(matchId, resultId, "VERIFY");
export const rejectMatchResult = (matchId: string, resultId: string, reason?: string) => transitionMatchResult(matchId, resultId, "REJECT", reason);
export const disputeMatchResult = (matchId: string, resultId: string) => transitionMatchResult(matchId, resultId, "DISPUTE");
