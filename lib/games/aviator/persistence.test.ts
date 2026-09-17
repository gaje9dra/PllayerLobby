import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { getAviatorHistory, persistFinalizedAviatorRound } from "./persistence";

test("finalized aviator rounds are persisted without tick-level records", async () => {
  const roundId = crypto.randomUUID();
  const crashedAt = Date.now();

  try {
    await persistFinalizedAviatorRound(
      {
        roundId,
        phase: "CRASHED",
        serverTime: crashedAt,
        multiplier: 2.34,
        startedAt: crashedAt - 1_000,
        waitingEndsAt: null,
      },
      2.34,
    );

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
