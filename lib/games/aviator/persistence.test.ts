import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { getAviatorHistory, persistFinalizedAviatorRound } from "./persistence";
import type { AviatorRoundSnapshot } from "./types";

const fairness = {
  roundId: "round-test",
  serverSeedHash: "a".repeat(64),
  clientSeed: "playerlobby-aviator-v1",
  nonce: "1",
  algorithmVersion: "v1" as const,
};

test("finalized aviator rounds are persisted without tick-level records", async () => {
  const roundId = crypto.randomUUID();
  const crashedAt = Date.now();

  try {
    const snapshot: AviatorRoundSnapshot = {
      roundId,
      phase: "CRASHED",
      serverTime: crashedAt,
      multiplier: 2.34,
      startedAt: crashedAt - 1_000,
      waitingEndsAt: null,
      fairness: { ...fairness, roundId },
    };

    await persistFinalizedAviatorRound(snapshot, 2.34);

    const rows = await prisma.aviatorRound.findMany({ where: { id: roundId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "SETTLED");
    assert.equal(Number(rows[0]?.crashMultiplier), 2.34);

    const history = await getAviatorHistory(50);
    assert.ok(history.some((round) => round.id === roundId));
  } finally {
    await prisma.aviatorRound.delete({ where: { id: roundId } }).catch(() => undefined);
  }
});
