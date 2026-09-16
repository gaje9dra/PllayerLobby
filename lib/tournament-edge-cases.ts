import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";
import { validateMatchResultInput } from "@/lib/match-results";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_MATCHES = new Set(["PENDING", "READY", "LIVE"]);
const ACTION_MAX = 1000;

function assertUuid(value: string, code: string) {
  if (!UUID.test(value)) throw new Error(code);
}
function reasonOf(value: unknown) {
  const reason = String(value ?? "").trim();
  if (!reason || reason.length > ACTION_MAX || /[\u0000-\u001f\u007f]/.test(reason)) throw new Error("INVALID_REASON");
  return reason;
}
async function lock(tx: Pick<typeof prisma, "$queryRaw">, key: string) {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export async function cancelTournament(tournamentId: string, reason: string) {
  const admin = await requireAdmin(); assertUuid(tournamentId, "INVALID_TOURNAMENT"); const cleanReason = reasonOf(reason);
  return prisma.$transaction(async (tx) => {
    await lock(tx, `tournament-edge:${tournamentId}`);
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`SELECT "id","status" FROM "Tournament" WHERE "id"=${tournamentId}::uuid FOR UPDATE`);
    if (!rows[0]) throw new Error("TOURNAMENT_NOT_FOUND");
    if (rows[0].status === "CANCELLED") return { ok: true, alreadyDone: true };
    await tx.$executeRaw(Prisma.sql`UPDATE "Tournament" SET "status"='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${tournamentId}::uuid`);
    await tx.$executeRaw(Prisma.sql`UPDATE "TournamentBracketMatch" SET "status"='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id" IN (SELECT m."id" FROM "TournamentBracketMatch" m JOIN "TournamentBracketRound" r ON r."id"=m."roundId" JOIN "TournamentBracket" b ON b."id"=r."bracketId" WHERE b."tournamentId"=${tournamentId}::uuid) AND "status" IN ('PENDING','READY','LIVE')`);
    await tx.$executeRaw(Prisma.sql`UPDATE "TournamentAccessCode" SET "status"='REVOKED',"revokedAt"=COALESCE("revokedAt",CURRENT_TIMESTAMP),"updatedAt"=CURRENT_TIMESTAMP WHERE "tournamentId"=${tournamentId}::uuid AND "status"='ACTIVE'`);
    await tx.$executeRaw(Prisma.sql`UPDATE "MatchRoomCredential" SET "revokedAt"=COALESCE("revokedAt",CURRENT_TIMESTAMP),"publishedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP,"updatedById"=${admin.id}::uuid WHERE "matchId" IN (SELECT m."id" FROM "TournamentBracketMatch" m JOIN "TournamentBracketRound" r ON r."id"=m."roundId" JOIN "TournamentBracket" b ON b."id"=r."bracketId" WHERE b."tournamentId"=${tournamentId}::uuid)`);
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: "TOURNAMENT_CANCELLED", targetType: "TOURNAMENT", targetId: tournamentId, metadata: { reason: cleanReason, fromStatus: rows[0].status } });
    return { ok: true, alreadyDone: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelMatch(matchId: string, reason: string) {
  const admin = await requireAdmin(); assertUuid(matchId, "INVALID_MATCH"); const cleanReason = reasonOf(reason);
  return prisma.$transaction(async (tx) => {
    await lock(tx, `match-edge:${matchId}`);
    const rows = await tx.$queryRaw<Array<{ status: string; tournamentId: string; tournamentStatus: string }>>(Prisma.sql`SELECT m."status",b."tournamentId",t."status" AS "tournamentStatus" FROM "TournamentBracketMatch" m JOIN "TournamentBracketRound" r ON r."id"=m."roundId" JOIN "TournamentBracket" b ON b."id"=r."bracketId" JOIN "Tournament" t ON t."id"=b."tournamentId" WHERE m."id"=${matchId}::uuid FOR UPDATE OF m,t`);
    if (!rows[0]) throw new Error("MATCH_NOT_FOUND");
    if (rows[0].status === "CANCELLED") return { ok: true, alreadyDone: true };
    if (rows[0].status === "COMPLETED") throw new Error("MATCH_ALREADY_COMPLETED");
    await tx.$executeRaw(Prisma.sql`UPDATE "TournamentBracketMatch" SET "status"='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${matchId}::uuid AND "status" IN ('PENDING','READY','LIVE','ABANDONED')`);
    await tx.$executeRaw(Prisma.sql`UPDATE "MatchRoomCredential" SET "revokedAt"=COALESCE("revokedAt",CURRENT_TIMESTAMP),"publishedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP,"updatedById"=${admin.id}::uuid WHERE "matchId"=${matchId}::uuid`);
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: "MATCH_CANCELLED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { tournamentId: rows[0].tournamentId, reason: cleanReason, fromStatus: rows[0].status } });
    return { ok: true, alreadyDone: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function markNoShow(matchId: string, registrationId: string, reason: string) {
  const admin = await requireAdmin(); assertUuid(matchId, "INVALID_MATCH"); assertUuid(registrationId, "INVALID_REGISTRATION"); const cleanReason = reasonOf(reason);
  return prisma.$transaction(async (tx) => {
    await lock(tx, `match-edge:${matchId}`);
    const match = await tx.$queryRaw<Array<{ status: string; tournamentId: string }>>(Prisma.sql`SELECT m."status",b."tournamentId" FROM "TournamentBracketMatch" m JOIN "TournamentBracketRound" r ON r."id"=m."roundId" JOIN "TournamentBracket" b ON b."id"=r."bracketId" WHERE m."id"=${matchId}::uuid FOR UPDATE`);
    if (!match[0]) throw new Error("MATCH_NOT_FOUND");
    if (!ACTIVE_MATCHES.has(match[0].status)) throw new Error("MATCH_NOT_ELIGIBLE");
    const slot = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT s."id" FROM "TournamentBracketSlot" s JOIN "Registration" r ON r."id"=s."registrationId" WHERE s."matchId"=${matchId}::uuid AND s."registrationId"=${registrationId}::uuid AND r."tournamentId"=${match[0].tournamentId}::uuid LIMIT 1`);
    if (!slot[0]) throw new Error("PARTICIPANT_NOT_ASSIGNED");
    const existing = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`SELECT "status" FROM "TournamentMatchParticipantState" WHERE "matchId"=${matchId}::uuid AND "registrationId"=${registrationId}::uuid FOR UPDATE`);
    if (existing[0]?.status === "NO_SHOW") return { ok: true, alreadyDone: true };
    if (existing[0]) await tx.$executeRaw(Prisma.sql`UPDATE "TournamentMatchParticipantState" SET "status"='NO_SHOW',"reason"=${cleanReason},"actorUserId"=${admin.id}::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "matchId"=${matchId}::uuid AND "registrationId"=${registrationId}::uuid`);
    else await tx.$executeRaw(Prisma.sql`INSERT INTO "TournamentMatchParticipantState" ("id","matchId","registrationId","status","reason","actorUserId","createdAt","updatedAt") VALUES (${crypto.randomUUID()}::uuid,${matchId}::uuid,${registrationId}::uuid,'NO_SHOW',${cleanReason},${admin.id}::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: "PARTICIPANT_NO_SHOW", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { tournamentId: match[0].tournamentId, registrationId, reason: cleanReason } });
    return { ok: true, alreadyDone: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function abandonMatch(matchId: string, reason: string) {
  const admin = await requireAdmin(); assertUuid(matchId, "INVALID_MATCH"); const cleanReason = reasonOf(reason);
  return prisma.$transaction(async (tx) => {
    await lock(tx, `match-edge:${matchId}`);
    const rows = await tx.$queryRaw<Array<{ status: string; tournamentId: string }>>(Prisma.sql`SELECT m."status",b."tournamentId" FROM "TournamentBracketMatch" m JOIN "TournamentBracketRound" r ON r."id"=m."roundId" JOIN "TournamentBracket" b ON b."id"=r."bracketId" WHERE m."id"=${matchId}::uuid FOR UPDATE`);
    if (!rows[0]) throw new Error("MATCH_NOT_FOUND");
    if (!["READY","LIVE"].includes(rows[0].status)) throw new Error("MATCH_NOT_ELIGIBLE");
    await tx.$executeRaw(Prisma.sql`UPDATE "TournamentBracketMatch" SET "status"='ABANDONED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${matchId}::uuid AND "status" IN ('READY','LIVE')`);
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: "MATCH_ABANDONED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { tournamentId: rows[0].tournamentId, reason: cleanReason } });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveDispute(matchId: string, resultId: string, resolution: "VERIFY" | "REJECT", reason: string) {
  const admin = await requireAdmin(); assertUuid(matchId, "INVALID_MATCH"); assertUuid(resultId, "INVALID_RESULT"); const cleanReason = reasonOf(reason);
  const { verifyMatchResult, rejectMatchResult } = await import("@/lib/match-results");
  const result = resolution === "VERIFY" ? await verifyMatchResult(matchId, resultId) : await rejectMatchResult(matchId, resultId, cleanReason);
  await recordAdminAuditEvent({ action: "MATCH_RESULT_DISPUTE_RESOLVED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { resultId, resolution, reason: cleanReason, actor: admin.id } });
  return result;
}

export async function correctMatchResult(matchId: string, resultId: string, input: unknown, reason: string) {
  const admin = await requireAdmin(); assertUuid(matchId, "INVALID_MATCH"); assertUuid(resultId, "INVALID_RESULT"); const cleanReason = reasonOf(reason); const parsed = validateMatchResultInput(input);
  return prisma.$transaction(async (tx) => {
    await lock(tx, `match-edge:${matchId}`);
    const resultRows = await tx.$queryRaw<Array<{ winnerRegistrationId: string | null; scores: unknown; status: string }>>(Prisma.sql`SELECT "winnerRegistrationId","scores","status" FROM "MatchResult" WHERE "id"=${resultId}::uuid AND "matchId"=${matchId}::uuid FOR UPDATE`);
    if (!resultRows[0] || resultRows[0].status !== "VERIFIED") throw new Error("RESULT_NOT_CORRECTABLE");
    const slots = await tx.$queryRaw<Array<{ registrationId: string | null }>>(Prisma.sql`SELECT "registrationId" FROM "TournamentBracketSlot" WHERE "matchId"=${matchId}::uuid`);
    const ids = new Set(slots.map((s) => s.registrationId).filter((id): id is string => Boolean(id)));
    if (ids.size !== 2 || !ids.has(parsed.winnerRegistrationId) || Object.keys(parsed.scores).some((id) => !ids.has(id))) throw new Error("INVALID_RESULT");
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MatchResultCorrection" ("id","matchId","resultId","previousWinnerRegistrationId","previousScores","correctedWinnerRegistrationId","correctedScores","reason","actorUserId","createdAt") VALUES (${crypto.randomUUID()}::uuid,${matchId}::uuid,${resultId}::uuid,${resultRows[0].winnerRegistrationId}::uuid,${JSON.stringify(resultRows[0].scores)}::jsonb,${parsed.winnerRegistrationId}::uuid,${JSON.stringify(parsed.scores)}::jsonb,${cleanReason},${admin.id}::uuid,CURRENT_TIMESTAMP)`);
    await tx.$executeRaw(Prisma.sql`UPDATE "MatchResult" SET "winnerRegistrationId"=${parsed.winnerRegistrationId}::uuid,"scores"=${JSON.stringify(parsed.scores)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${resultId}::uuid AND "status"='VERIFIED'`);
    await tx.$executeRaw(Prisma.sql`UPDATE "TournamentBracketMatch" SET "winnerRegistrationId"=${parsed.winnerRegistrationId}::uuid,"winnerSlot"=(SELECT "slotNumber" FROM "TournamentBracketSlot" WHERE "matchId"=${matchId}::uuid AND "registrationId"=${parsed.winnerRegistrationId}::uuid LIMIT 1),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${matchId}::uuid AND "status"='COMPLETED'`);
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: "MATCH_RESULT_CORRECTED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { resultId, previousWinnerRegistrationId: resultRows[0].winnerRegistrationId, correctedWinnerRegistrationId: parsed.winnerRegistrationId, reason: cleanReason } });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function correctBracketSlot(matchId: string, slotNumber: number, registrationId: string | null, reason: string) {
  const admin = await requireAdmin(); assertUuid(matchId, "INVALID_MATCH"); if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 2) throw new Error("INVALID_SLOT"); if (registrationId) assertUuid(registrationId, "INVALID_REGISTRATION"); const cleanReason = reasonOf(reason);
  return prisma.$transaction(async (tx) => {
    await lock(tx, `match-edge:${matchId}`);
    const context = await tx.$queryRaw<Array<{ tournamentId: string; status: string }>>(Prisma.sql`SELECT b."tournamentId",m."status" FROM "TournamentBracketMatch" m JOIN "TournamentBracketRound" r ON r."id"=m."roundId" JOIN "TournamentBracket" b ON b."id"=r."bracketId" WHERE m."id"=${matchId}::uuid FOR UPDATE`);
    if (!context[0]) throw new Error("MATCH_NOT_FOUND");
    if (["COMPLETED","CANCELLED"].includes(context[0].status)) throw new Error("MATCH_NOT_CORRECTABLE");
    if (registrationId) {
      const reg = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Registration" WHERE "id"=${registrationId}::uuid AND "tournamentId"=${context[0].tournamentId}::uuid AND "status"='CONFIRMED' LIMIT 1`);
      if (!reg[0]) throw new Error("REGISTRATION_NOT_ELIGIBLE");
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT s."id" FROM "TournamentBracketSlot" s JOIN "TournamentBracketMatch" m ON m."id"=s."matchId" JOIN "TournamentBracketRound" r ON r."id"=m."roundId" JOIN "TournamentBracket" b ON b."id"=r."bracketId" WHERE b."tournamentId"=${context[0].tournamentId}::uuid AND s."registrationId"=${registrationId}::uuid AND s."matchId"<>${matchId}::uuid LIMIT 1`);
      if (duplicate[0]) throw new Error("REGISTRATION_ALREADY_ASSIGNED");
    }
    const old = await tx.$queryRaw<Array<{ registrationId: string | null }>>(Prisma.sql`SELECT "registrationId" FROM "TournamentBracketSlot" WHERE "matchId"=${matchId}::uuid AND "slotNumber"=${slotNumber} FOR UPDATE`);
    if (!old[0]) throw new Error("SLOT_NOT_FOUND");
    await tx.$executeRaw(Prisma.sql`INSERT INTO "BracketCorrection" ("id","matchId","slotNumber","previousRegistrationId","correctedRegistrationId","reason","actorUserId","createdAt") VALUES (${crypto.randomUUID()}::uuid,${matchId}::uuid,${slotNumber},${old[0].registrationId}::uuid,${registrationId ? Prisma.sql`${registrationId}::uuid` : Prisma.sql`NULL`},${cleanReason},${admin.id}::uuid,CURRENT_TIMESTAMP)`);
    await tx.$executeRaw(Prisma.sql`UPDATE "TournamentBracketSlot" SET "registrationId"=${registrationId ? Prisma.sql`${registrationId}::uuid` : Prisma.sql`NULL`},"updatedAt"=CURRENT_TIMESTAMP WHERE "matchId"=${matchId}::uuid AND "slotNumber"=${slotNumber}`);
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: "BRACKET_CORRECTED", targetType: "TOURNAMENT_BRACKET_MATCH", targetId: matchId, metadata: { tournamentId: context[0].tournamentId, slotNumber, previousRegistrationId: old[0].registrationId, correctedRegistrationId: registrationId, reason: cleanReason } });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
