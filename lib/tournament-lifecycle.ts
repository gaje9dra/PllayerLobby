import "server-only";

import { TournamentStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";
import { getDueTournamentStatus, type TournamentLifecycleInput } from "@/lib/tournament-lifecycle-rules";

const LIFECYCLE_BATCH_SIZE = 100;
function lifecycleInput(tournament: { status: TournamentStatus; registrationStartTime: Date | null; registrationEndTime: Date | null; startTime: Date }): TournamentLifecycleInput { return tournament; }
function systemAuditActorId() { const actorId = process.env.CRON_ACTOR_USER_ID?.trim(); return actorId || null; }

export function getEffectiveTournamentStatus(tournament: TournamentLifecycleInput, now = new Date()) { let status = tournament.status; const input = () => ({ ...tournament, status }); for (let i = 0; i < 3; i += 1) { const next = getDueTournamentStatus(input(), now); if (!next) break; status = next; } return status; }

async function transitionTournament(tournament: { id: string; status: TournamentStatus }, next: TournamentStatus, actorUserId: string | null, now: Date) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.tournament.updateMany({ where: { id: tournament.id, status: tournament.status }, data: { status: next } });
    if (result.count !== 1) return false;
    if (actorUserId) await recordAdminAuditEventInTransaction(tx, actorUserId, { action: "TOURNAMENT_LIFECYCLE_TRANSITIONED", targetType: "TOURNAMENT", targetId: tournament.id, metadata: { actor: "SYSTEM", fromStatus: tournament.status, toStatus: next, timestamp: now.toISOString() } });
    return true;
  });
}

export async function refreshTournamentLifecycle(tournamentId: string) {
  const now = new Date();
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true, registrationStartTime: true, registrationEndTime: true, startTime: true } });
  if (!tournament) return null;
  const actorUserId = systemAuditActorId(); let status = tournament.status;
  for (let i = 0; i < 3; i += 1) { const next = getDueTournamentStatus(lifecycleInput({ ...tournament, status }), now); if (!next) break; const changed = await transitionTournament({ id: tournament.id, status }, next, actorUserId, now); if (!changed) { const current = await prisma.tournament.findUnique({ where: { id: tournament.id }, select: { status: true } }); return current?.status ?? null; } status = next; }
  return status;
}

export async function updateDueTournamentLifecycles() {
  const now = new Date(); const actorUserId = systemAuditActorId(); let updated = 0; let scanned = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    const candidates = await prisma.tournament.findMany({ where: { OR: [{ status: TournamentStatus.UPCOMING, registrationStartTime: { lte: now } }, { status: TournamentStatus.REGISTRATION_OPEN, registrationEndTime: { lte: now } }, { status: TournamentStatus.REGISTRATION_CLOSED, startTime: { lte: now } }] }, orderBy: { updatedAt: "asc" }, take: LIFECYCLE_BATCH_SIZE, select: { id: true, status: true, registrationStartTime: true, registrationEndTime: true, startTime: true } });
    if (candidates.length === 0) break; scanned += candidates.length;
    for (const tournament of candidates) { const next = getDueTournamentStatus(lifecycleInput(tournament), now); if (!next) continue; if (await transitionTournament({ id: tournament.id, status: tournament.status }, next, actorUserId, now)) updated += 1; }
  }
  return { scanned, updated };
}
