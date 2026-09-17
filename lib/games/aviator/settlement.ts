import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { emitAviatorBetEvent } from "./betting-events";
import type { AviatorRoundSnapshot } from "./types";

async function ensureRoundRow(tx: Prisma.TransactionClient, snapshot: AviatorRoundSnapshot) {
  await tx.aviatorRound.upsert({
    where: { id: snapshot.roundId },
    create: { id: snapshot.roundId, status: snapshot.phase, startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : null },
    update: { status: snapshot.phase, startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : undefined },
  });
}

/**
 * Crash settlement is intentionally kept separate from betting.ts.
 * The custom Node/tsx server invokes this from the engine, so this module
 * must not import Next.js server-only guards or request/auth helpers.
 */
export async function settleAviatorCrash(snapshot: AviatorRoundSnapshot, crashPoint: number) {
  return prisma.$transaction(async (tx) => {
    await ensureRoundRow(tx, snapshot);
    await tx.aviatorRound.update({
      where: { id: snapshot.roundId },
      data: { status: "CRASHED", crashedAt: new Date(snapshot.serverTime), crashMultiplier: crashPoint },
    });

    const active = await tx.aviatorBet.findMany({
      where: { roundId: snapshot.roundId, status: "ACTIVE" },
      select: { id: true },
    });

    if (active.length) {
      await tx.aviatorBet.updateMany({
        where: { roundId: snapshot.roundId, status: "ACTIVE" },
        data: { status: "LOST", updatedAt: new Date(snapshot.serverTime) },
      });
    }

    for (const bet of active) {
      emitAviatorBetEvent({ type: "bet:lost", roundId: snapshot.roundId, betId: bet.id, status: "LOST" });
    }

    return active.length;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
