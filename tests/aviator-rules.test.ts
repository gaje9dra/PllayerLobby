import assert from "node:assert/strict";
import test from "node:test";
import { multiplyMoneyByMultiplier } from "@/lib/wallet-rules";
import { AviatorGameEngine } from "@/lib/games/aviator/engine";

test("aviator payout money arithmetic stays decimal-safe", () => {
  assert.equal(multiplyMoneyByMultiplier("100.00", "2.50"), "250.00");
  assert.equal(multiplyMoneyByMultiplier("99.99", "1.01"), "100.99");
  assert.equal(multiplyMoneyByMultiplier("0.01", "1.01"), "0.01");
});

test("aviator state lock serializes concurrent financial operations", async () => {
  const engine = new AviatorGameEngine({ now: () => 1_000 });
  const order: string[] = [];
  const first = engine.withStateLock(async () => {
    order.push("first-start");
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push("first-end");
  });
  const second = engine.withStateLock(async () => {
    order.push("second-start");
    order.push("second-end");
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first-start", "first-end", "second-start", "second-end"]);
});

test("aviator state lock releases after a rejected operation", async () => {
  const engine = new AviatorGameEngine({ now: () => 1_000 });
  await assert.rejects(engine.withStateLock(async () => { throw new Error("expected"); }), /expected/);
  let ran = false;
  await engine.withStateLock(() => { ran = true; });
  assert.equal(ran, true);
});

test("aviator public snapshot exposes only the fairness commitment", () => {
  const engine = new AviatorGameEngine({ now: () => 1_000 });
  const snapshot = engine.getSnapshot();
  const serialized = JSON.stringify(snapshot);
  assert.equal("serverSeed" in snapshot.fairness, false);
  assert.equal(serialized.includes("serverSeed"), false);
  assert.equal(snapshot.fairness.serverSeedHash.length, 64);
  assert.equal(snapshot.fairness.algorithmVersion, "v1");
});
