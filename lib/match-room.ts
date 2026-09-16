import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";
import { canParticipantAccessMatchRoom, isEligibleMatchRegistration } from "@/lib/match-room-rules";
import { MAX_ROOM_ID_LENGTH, MAX_ROOM_PASSWORD_LENGTH, normalizeMatchRoomValue } from "@/lib/match-room-input";
import { decryptMatchRoomSecret, encryptMatchRoomSecret } from "@/lib/match-room-crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new Error(`INVALID_${label.toUpperCase()}`);
}

export type MatchRoomMutationResult = { ok: true } | { ok: false; message: string };

type MatchContext = {
  matchId: string;
  matchStatus: string;
  tournamentId: string;
  tournamentStatus: string;
  tournamentName: string;
};

async function getMatchContext(matchId: string): Promise<MatchContext | null> {
  const rows = await prisma.$queryRaw<MatchContext[]>(Prisma.sql`
    SELECT m."id" AS "matchId", m."status" AS "matchStatus", t."id" AS "tournamentId", t."status" AS "tournamentStatus", t."name" AS "tournamentName"
    FROM "TournamentBracketMatch" m
    INNER JOIN "TournamentBracketRound" r ON r."id" = m."roundId"
    INNER JOIN "TournamentBracket" b ON b."id" = r."bracketId"
    INNER JOIN "Tournament" t ON t."id" = b."tournamentId"
    WHERE m."id" = ${matchId}::uuid
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getAdminMatchRoom(matchId: string, reveal = false) {
  await requireAdmin();
  assertUuid(matchId, "match_id");
  const context = await getMatchContext(matchId);
  if (!context) return null;
  const rows = await prisma.$queryRaw<Array<{ matchId: string; roomIdEncrypted: string; roomPasswordEncrypted: string; publishedAt: Date | null; revokedAt: Date | null; updatedAt: Date; updatedById: string }>>(Prisma.sql`
    SELECT "matchId", "roomIdEncrypted", "roomPasswordEncrypted", "publishedAt", "revokedAt", "updatedAt", "updatedById"
    FROM "MatchRoomCredential"
    WHERE "matchId" = ${matchId}::uuid
    LIMIT 1
  `);
  const room = rows[0];
  if (!room) return { ...context, configured: false, published: false, revoked: false };
  return {
    ...context,
    configured: true,
    published: Boolean(room.publishedAt) && !room.revokedAt,
    revoked: Boolean(room.revokedAt),
    publishedAt: room.publishedAt,
    revokedAt: room.revokedAt,
    updatedAt: room.updatedAt,
    updatedById: room.updatedById,
    ...(reveal ? { roomId: decryptMatchRoomSecret(room.roomIdEncrypted), roomPassword: decryptMatchRoomSecret(room.roomPasswordEncrypted) } : {}),
  };
}

export async function upsertMatchRoom(input: { matchId: string; roomId: string; roomPassword: string; published: boolean }): Promise<MatchRoomMutationResult> {
  const admin = await requireAdmin();
  assertUuid(input.matchId, "match_id");
  const roomId = normalizeMatchRoomValue(input.roomId, MAX_ROOM_ID_LENGTH);
  const roomPassword = normalizeMatchRoomValue(input.roomPassword, MAX_ROOM_PASSWORD_LENGTH);
  if (!roomId || !roomPassword) return { ok: false, message: "Room ID and room password are required and must be within the allowed length." };

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`match-room:${input.matchId}`}, 0))`);
    const contextRows = await tx.$queryRaw<MatchContext[]>(Prisma.sql`
      SELECT m."id" AS "matchId", m."status" AS "matchStatus", t."id" AS "tournamentId", t."status" AS "tournamentStatus", t."name" AS "tournamentName"
      FROM "TournamentBracketMatch" m
      INNER JOIN "TournamentBracketRound" r ON r."id" = m."roundId"
      INNER JOIN "TournamentBracket" b ON b."id" = r."bracketId"
      INNER JOIN "Tournament" t ON t."id" = b."tournamentId"
      WHERE m."id" = ${input.matchId}::uuid
      FOR UPDATE OF m, t
    `);
    const context = contextRows[0];
    if (!context) return { ok: false, message: "Match not found." };
    if (context.tournamentStatus === "DRAFT" || context.tournamentStatus === "CANCELLED") return { ok: false, message: "Room credentials cannot be configured for this tournament state." };
    if (context.matchStatus === "COMPLETED" || context.matchStatus === "CANCELLED") return { ok: false, message: "Room credentials cannot be changed for a completed or cancelled match." };

    const encryptedId = encryptMatchRoomSecret(roomId);
    const encryptedPassword = encryptMatchRoomSecret(roomPassword);
    const rows = await tx.$queryRaw<{ created: boolean }[]>(Prisma.sql`
      INSERT INTO "MatchRoomCredential" ("id", "matchId", "roomIdEncrypted", "roomPasswordEncrypted", "createdAt", "updatedAt", "publishedAt", "revokedAt", "updatedById")
      VALUES (${randomUUID()}::uuid, ${input.matchId}::uuid, ${encryptedId}, ${encryptedPassword}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${input.published ? Prisma.sql`CURRENT_TIMESTAMP` : Prisma.sql`NULL`}, ${input.published ? Prisma.sql`NULL` : Prisma.sql`CURRENT_TIMESTAMP`}, ${admin.id}::uuid)
      ON CONFLICT ("matchId") DO UPDATE SET
        "roomIdEncrypted" = EXCLUDED."roomIdEncrypted",
        "roomPasswordEncrypted" = EXCLUDED."roomPasswordEncrypted",
        "updatedAt" = CURRENT_TIMESTAMP,
        "publishedAt" = EXCLUDED."publishedAt",
        "revokedAt" = EXCLUDED."revokedAt",
        "updatedById" = EXCLUDED."updatedById"
      RETURNING (xmax = 0) AS "created"
    `);
    const created = Boolean(rows[0]?.created);
    await recordAdminAuditEventInTransaction(tx, admin.id, {
      action: created ? "MATCH_ROOM_CREATED" : "MATCH_ROOM_UPDATED",
      targetType: "TOURNAMENT_BRACKET_MATCH",
      targetId: input.matchId,
      metadata: { tournamentId: context.tournamentId, published: input.published },
    });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function revokeMatchRoom(matchId: string): Promise<MatchRoomMutationResult> {
  const admin = await requireAdmin();
  assertUuid(matchId, "match_id");
  return prisma.$transaction(async (tx) => {
    const contextRows = await tx.$queryRaw<MatchContext[]>(Prisma.sql`
      SELECT m."id" AS "matchId", m."status" AS "matchStatus", t."id" AS "tournamentId", t."status" AS "tournamentStatus", t."name" AS "tournamentName"
      FROM "TournamentBracketMatch" m
      INNER JOIN "TournamentBracketRound" r ON r."id" = m."roundId"
      INNER JOIN "TournamentBracket" b ON b."id" = r."bracketId"
      INNER JOIN "Tournament" t ON t."id" = b."tournamentId"
      WHERE m."id" = ${matchId}::uuid
      FOR UPDATE OF m, t
    `);
    const context = contextRows[0];
    if (!context) return { ok: false, message: "Match not found." };
    await tx.$executeRaw(Prisma.sql`
      UPDATE "MatchRoomCredential"
      SET "revokedAt" = CURRENT_TIMESTAMP, "publishedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP, "updatedById" = ${admin.id}::uuid
      WHERE "matchId" = ${matchId}::uuid
    `);
    await recordAdminAuditEventInTransaction(tx, admin.id, {
      action: "MATCH_ROOM_REVOKED",
      targetType: "TOURNAMENT_BRACKET_MATCH",
      targetId: matchId,
      metadata: { tournamentId: context.tournamentId },
    });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type ParticipantMatchRoomAccess = { ok: true; roomId: string; roomPassword: string } | { ok: false; reason: string };

export async function getParticipantMatchRoomAccess(matchId: string): Promise<ParticipantMatchRoomAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "Login to continue." };
  if (user.status !== "ACTIVE") return { ok: false, reason: "Your account is not currently eligible to access match credentials." };
  assertUuid(matchId, "match_id");

  const context = await getMatchContext(matchId);
  if (!context) return { ok: false, reason: "Match not found." };
  if (!canParticipantAccessMatchRoom(context.tournamentStatus, context.matchStatus)) return { ok: false, reason: "Match credentials are not available for this match state." };

  const eligible = await prisma.$queryRaw<{ registrationId: string }[]>(Prisma.sql`
    SELECT r."id" AS "registrationId"
    FROM "TournamentBracketSlot" s
    INNER JOIN "Registration" r ON r."id" = s."registrationId"
    WHERE s."matchId" = ${matchId}::uuid
      AND r."userId" = ${user.id}::uuid
      AND r."tournamentId" = ${context.tournamentId}::uuid
      AND r."status" = 'CONFIRMED'
    LIMIT 1
  `);
  const eligibleRegistration = isEligibleMatchRegistration({ authenticated: true, userActive: user.status === "ACTIVE", registrationConfirmed: Boolean(eligible[0]), registrationBelongsToTournament: Boolean(eligible[0]), registrationOccupiesMatch: Boolean(eligible[0]) });
  if (!eligibleRegistration) return { ok: false, reason: "You are not an eligible participant in this match." };

  const room = await prisma.$queryRaw<Array<{ roomIdEncrypted: string; roomPasswordEncrypted: string; publishedAt: Date | null; revokedAt: Date | null }>>(Prisma.sql`
    SELECT "roomIdEncrypted", "roomPasswordEncrypted", "publishedAt", "revokedAt"
    FROM "MatchRoomCredential"
    WHERE "matchId" = ${matchId}::uuid
    LIMIT 1
  `);
  if (!room[0] || !room[0].publishedAt || room[0].revokedAt) return { ok: false, reason: "Room credentials are not available yet." };

  return { ok: true, roomId: decryptMatchRoomSecret(room[0].roomIdEncrypted), roomPassword: decryptMatchRoomSecret(room[0].roomPasswordEncrypted) };
}
