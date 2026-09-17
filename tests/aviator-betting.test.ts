import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAviatorEngine } from "@/lib/games/aviator/server";
import { cashoutAviatorBetForUser, placeAviatorBetForUser, settleAviatorCrash } from "@/lib/games/aviator/betting";

function userInput(user: { id: string }) { return { id: user.id, status: "ACTIVE" as const }; }

async function createFixture(balance = "500.00") {
  const user = await prisma.user.create({ data: { email: `aviator-${crypto.randomUUID()}@example.test`, role: "USER", status: "ACTIVE" } });
  const wallet = await prisma.wallet.create({ data: { userId: user.id, currency: "INR", balance } });
  return { user, wallet };
}

async function cleanup(userId: string, walletId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.aviatorBet.deleteMany({ where: { userId } });
    await tx.walletTransaction.deleteMany({ where: { walletId } });
    await tx.wallet.deleteMany({ where: { id: walletId } });
    await tx.user.deleteMany({ where: { id: userId } });
  });
}

function resetEngine() {
  const engine = getAviatorEngine();
  engine.stop();
  if (engine.getSnapshot().phase === "RUNNING") engine.forceTransition("CRASHED");
  if (engine.getSnapshot().phase === "CRASHED") engine.forceTransition("SETTLED");
  if (engine.getSnapshot().phase === "SETTLED") engine.forceTransition("WAITING");
  return engine;
}

test("valid Aviator bet debits wallet and creates one ledger transaction", async () => {
  const fixture = await createFixture();
  const engine = resetEngine();
  try {
    const result = await placeAviatorBetForUser(userInput(fixture.user), { roundId: engine.getSnapshot().roundId, amount: "100.00", clientRequestId: crypto.randomUUID() });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.bet.status, "ACTIVE");
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: fixture.wallet.id } })).balance.toString(), "400");
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: fixture.wallet.id, referenceType: "AVIATOR_BET", type: "DEBIT", category: "AVIATOR_BET" } }), 1);
  } finally {
    await cleanup(fixture.user.id, fixture.wallet.id);
  }
});

test("duplicate Aviator request is idempotent", async () => {
  const fixture = await createFixture();
  const engine = resetEngine();
  const clientRequestId = crypto.randomUUID();
  try {
    const input = { roundId: engine.getSnapshot().roundId, amount: "100.00", clientRequestId };
    const first = await placeAviatorBetForUser(userInput(fixture.user), input);
    const second = await placeAviatorBetForUser(userInput(fixture.user), input);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.bet.id, second.bet.id);
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: fixture.wallet.id } })).balance.toString(), "400");
    assert.equal(await prisma.aviatorBet.count({ where: { userId: fixture.user.id } }), 1);
  } finally {
    await cleanup(fixture.user.id, fixture.wallet.id);
  }
});

test("simultaneous cashouts settle a bet once and credit the wallet once", async () => {
  const fixture = await createFixture();
  const engine = resetEngine();
  try {
    const placed = await placeAviatorBetForUser(userInput(fixture.user), { roundId: engine.getSnapshot().roundId, amount: "100.00", clientRequestId: crypto.randomUUID() });
    assert.equal(placed.ok, true);
    if (!placed.ok) return;
    engine.forceTransition("RUNNING");
    const [first, second] = await Promise.all([
      cashoutAviatorBetForUser(userInput(fixture.user), placed.bet.id, placed.bet.roundId),
      cashoutAviatorBetForUser(userInput(fixture.user), placed.bet.id, placed.bet.roundId),
    ]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    assert.equal(await prisma.aviatorBet.count({ where: { id: placed.bet.id, status: "CASHED_OUT" } }), 1);
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: fixture.wallet.id, referenceType: "AVIATOR_BET", type: "CREDIT", category: "AVIATOR_BET" } }), 1);
  } finally {
    await cleanup(fixture.user.id, fixture.wallet.id);
  }
});

test("active bet becomes LOST on crash and receives no payout", async () => {
  const fixture = await createFixture();
  const engine = resetEngine();
  try {
    const placed = await placeAviatorBetForUser(userInput(fixture.user), { roundId: engine.getSnapshot().roundId, amount: "100.00", clientRequestId: crypto.randomUUID() });
    assert.equal(placed.ok, true);
    if (!placed.ok) return;
    engine.forceTransition("RUNNING");
    engine.forceTransition("CRASHED");
    await settleAviatorCrash(engine.getSnapshot().roundId, 1.50);
    const bet = await prisma.aviatorBet.findUniqueOrThrow({ where: { id: placed.bet.id } });
    assert.equal(bet.status, "LOST");
    assert.equal(bet.payout.toString(), "0");
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: fixture.wallet.id, referenceType: "AVIATOR_BET", type: "CREDIT", category: "AVIATOR_BET" } }), 0);
  } finally {
    await cleanup(fixture.user.id, fixture.wallet.id);
  }
});