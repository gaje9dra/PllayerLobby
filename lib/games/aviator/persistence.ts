import "server-only";

import { prisma } from "@/lib/prisma";
import type { AviatorRoundSnapshot } from "./engine";

export async function persistFinalizedAviatorRound(snapshot: AviatorRoundSnapshot, crashMultiplier: number) {
  return prisma.aviatorRound.upsert({
    where: { id: snapshot.roundId },
    create: {
      id: snapshot.roundId,
      status: "SETTLED",
      startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : new Date(snapshot.serverTime),
      crashedAt: new Date(snapshot.serverTime),
      crashMultiplier,
    },
    update: { status: "SETTLED", crashedAt: new Date(snapshot.serverTime), crashMultiplier },
  });
}

export async function getAviatorHistory(limit = 20) {
  return prisma.aviatorRound.findMany({
    where: { status: "SETTLED" },
    orderBy: { crashedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, crashMultiplier: true, crashedAt: true },
  });
}
