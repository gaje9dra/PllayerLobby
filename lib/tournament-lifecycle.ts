import "server-only";

import { TournamentStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getDueTournamentStatus,
  type TournamentLifecycleInput,
} from "@/lib/tournament-lifecycle-rules";

const LIFECYCLE_BATCH_SIZE = 100;

function lifecycleInput(tournament: {
  status: TournamentStatus;
  registrationStartTime: Date | null;
  registrationEndTime: Date | null;
  startTime: Date;
}): TournamentLifecycleInput {
  return tournament;
}

export function getEffectiveTournamentStatus(
  tournament: TournamentLifecycleInput,
  now = new Date(),
) {
  let status = tournament.status;
  const input = () => ({ ...tournament, status });

  // Apply all currently-due forward transitions without inventing a LIVE end time.
  for (let i = 0; i < 3; i += 1) {
    const next = getDueTournamentStatus(input(), now);
    if (!next) break;
    status = next;
  }

  return status;
}

export async function refreshTournamentLifecycle(tournamentId: string) {
  const now = new Date();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      status: true,
      registrationStartTime: true,
      registrationEndTime: true,
      startTime: true,
    },
  });

  if (!tournament) return null;

  let status = tournament.status;
  for (let i = 0; i < 3; i += 1) {
    const next = getDueTournamentStatus(
      lifecycleInput({ ...tournament, status }),
      now,
    );
    if (!next) break;

    const result = await prisma.tournament.updateMany({
      where: { id: tournament.id, status },
      data: { status: next },
    });

    if (result.count !== 1) {
      const current = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        select: { status: true },
      });
      return current?.status ?? null;
    }

    status = next;
  }

  return status;
}

export async function updateDueTournamentLifecycles() {
  const now = new Date();
  let updated = 0;
  let scanned = 0;

  // Repeat so a tournament that is several lifecycle steps behind can catch up,
  // while each query remains bounded and status updates stay conditional.
  for (let pass = 0; pass < 3; pass += 1) {
    const candidates = await prisma.tournament.findMany({
      where: {
        OR: [
          {
            status: TournamentStatus.UPCOMING,
            registrationStartTime: { lte: now },
          },
          {
            status: TournamentStatus.REGISTRATION_OPEN,
            registrationEndTime: { lte: now },
          },
          {
            status: TournamentStatus.REGISTRATION_CLOSED,
            startTime: { lte: now },
          },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: LIFECYCLE_BATCH_SIZE,
      select: {
        id: true,
        status: true,
        registrationStartTime: true,
        registrationEndTime: true,
        startTime: true,
      },
    });

    if (candidates.length === 0) break;
    scanned += candidates.length;

    for (const tournament of candidates) {
      const next = getDueTournamentStatus(lifecycleInput(tournament), now);
      if (!next) continue;

      const result = await prisma.tournament.updateMany({
        where: { id: tournament.id, status: tournament.status },
        data: { status: next },
      });
      updated += result.count;
    }
  }

  return { scanned, updated };
}
