import "server-only";

import { Prisma, TournamentStatus } from "@/app/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { verifyTournamentAccessCode } from "@/lib/tournament-access-code";
import { getJoiningWindowStart, isParticipantMatchClosed, isParticipantMatchJoinable } from "@/lib/tournament-room-rules";
import { decryptMatchRoomSecret } from "@/lib/match-room-crypto";
import { prisma } from "@/lib/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TournamentAccessResult =
  | { ok: true; matchId: string; roundNumber: number; matchNumber: number; roomId: string; roomPassword: string }
  | { ok: false; reason: string; accessOpensAt?: Date };

async function auditAccess(userId: string, tournamentId: string, action: string, matchId?: string) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AdminAuditLog" ("id", "actorUserId", "action", "targetType", "targetId", "metadataJson", "createdAt")
    VALUES (gen_random_uuid(), ${userId}::uuid, ${action}, 'TOURNAMENT_ACCESS', ${matchId ?? tournamentId}, ${JSON.stringify({ tournamentId, ...(matchId ? { matchId } : {}) })}, CURRENT_TIMESTAMP)
  `);
}

export async function getParticipantTournamentAccess(tournamentId: string, accessCode: string): Promise<TournamentAccessResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "Login to continue." };
  if (user.status !== "ACTIVE" || !UUID.test(tournamentId)) return { ok: false, reason: "Access denied." };

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true, startTime: true, joiningWindowMinutes: true } });
  if (!tournament || tournament.status === TournamentStatus.CANCELLED || tournament.status === TournamentStatus.COMPLETED) {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_DENIED_STATE");
    return { ok: false, reason: "Tournament access is unavailable." };
  }

  const dbNowRows = await prisma.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT CURRENT_TIMESTAMP AS now`);
  const now = dbNowRows[0]?.now;
  if (!now) {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_DENIED_STATE");
    return { ok: false, reason: "Tournament access is temporarily unavailable." };
  }

  const accessOpensAt = getJoiningWindowStart(tournament.startTime, tournament.joiningWindowMinutes);
  if (now < accessOpensAt) {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_DENIED_TIMING");
    return { ok: false, reason: "Tournament access has not opened yet.", accessOpensAt };
  }

  const verified = await verifyTournamentAccessCode(tournamentId, accessCode);
  if (!verified.verified) {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_FAILED");
    return { ok: false, reason: "Invalid tournament access code." };
  }

  const assigned = await prisma.$queryRaw<Array<{ matchId: string; roundNumber: number; matchNumber: number; matchStatus: string }>>(Prisma.sql`
    SELECT m."id" AS "matchId", r."roundNumber", m."matchNumber", m."status" AS "matchStatus"
    FROM "TournamentBracketSlot" s
    INNER JOIN "TournamentBracketMatch" m ON m."id" = s."matchId"
    INNER JOIN "TournamentBracketRound" r ON r."id" = m."roundId"
    INNER JOIN "Registration" reg ON reg."id" = s."registrationId"
    WHERE reg."userId" = ${user.id}::uuid
      AND reg."tournamentId" = ${tournamentId}::uuid
      AND reg."status" = 'CONFIRMED'
      AND s."registrationId" IS NOT NULL
    ORDER BY CASE WHEN m."status" = 'LIVE' THEN 0 WHEN m."status" = 'READY' THEN 1 WHEN m."status" = 'PENDING' THEN 2 ELSE 3 END, r."roundNumber" ASC, m."matchNumber" ASC
    LIMIT 1
  `);
  const match = assigned[0];
  if (!match) {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_DENIED_ELIGIBILITY");
    return { ok: false, reason: "No active match is assigned to your confirmed registration." };
  }

  if (isParticipantMatchClosed(match.matchStatus)) {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_DENIED_MATCH", match.matchId);
    return { ok: false, reason: "Your match is no longer available for joining." };
  }
  if (!isParticipantMatchJoinable(match.matchStatus)) {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_DENIED_MATCH", match.matchId);
    return { ok: false, reason: "Your match is not currently available for joining." };
  }

  const room = await prisma.$queryRaw<Array<{ roomIdEncrypted: string; roomPasswordEncrypted: string; publishedAt: Date | null; revokedAt: Date | null }>>(Prisma.sql`
    SELECT "roomIdEncrypted", "roomPasswordEncrypted", "publishedAt", "revokedAt"
    FROM "MatchRoomCredential"
    WHERE "matchId" = ${match.matchId}::uuid
    LIMIT 1
  `);
  if (!room[0] || !room[0].publishedAt || room[0].revokedAt) {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_ROOM_NOT_READY", match.matchId);
    return { ok: false, reason: "Room details are not available yet. Please check again later." };
  }

  try {
    const roomId = decryptMatchRoomSecret(room[0].roomIdEncrypted);
    const roomPassword = decryptMatchRoomSecret(room[0].roomPasswordEncrypted);
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_SUCCESS", match.matchId);
    return { ok: true, matchId: match.matchId, roundNumber: match.roundNumber, matchNumber: match.matchNumber, roomId, roomPassword };
  } catch {
    await auditAccess(user.id, tournamentId, "TOURNAMENT_ACCESS_ROOM_ERROR", match.matchId);
    return { ok: false, reason: "Room details are not available yet. Please check again later." };
  }
}
