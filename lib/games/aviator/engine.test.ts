import assert from "node:assert/strict";
import test from "node:test";
import { AviatorGameEngine } from "./engine";

const fastTimings = { waitingMs: 5, settledMs: 5, updateIntervalMs: 5 };

test("aviator starts in waiting with a server-generated round", () => {
  const engine = new AviatorGameEngine({ now: () => 1_000 });
  const snapshot = engine.getSnapshot();
  assert.equal(snapshot.phase, "WAITING");
  assert.equal(snapshot.multiplier, 1);
  assert.notEqual(snapshot.roundId, "loading");
  assert.ok(snapshot.waitingEndsAt && snapshot.waitingEndsAt > snapshot.serverTime);
});

test("aviator rejects invalid transitions", () => {
  const engine = new AviatorGameEngine({ now: () => 1_000 });
  assert.throws(() => engine.forceTransition("CRASHED"), /INVALID_STATE_TRANSITION/);
});

test("crash point is not exposed in public snapshots", () => {
  const engine = new AviatorGameEngine({
    now: () => 1_000,
    crashPointGenerator: { generate: () => 2 },
  });
  assert.equal("crashPoint" in engine.getSnapshot(), false);
  assert.equal(engine.getCrashPointForPersistence(), null);
});

test("aviator completes a round and starts the next waiting round", async () => {
  const phases: string[] = [];
  const engine = new AviatorGameEngine({
    crashPointGenerator: { generate: () => 1.01 },
    timings: fastTimings,
  });
  const unsubscribe = engine.subscribe((snapshot) => phases.push(snapshot.phase));

  engine.start();
  await new Promise((resolve) => setTimeout(resolve, 100));
  engine.stop();
  unsubscribe();

  assert.ok(phases.includes("WAITING"));
  assert.ok(phases.includes("RUNNING"));
  assert.ok(phases.includes("CRASHED"));
  assert.ok(phases.includes("SETTLED"));
  assert.equal(engine.getSnapshot().phase, "WAITING");
});

test("crash callback receives the authoritative final multiplier", async () => {
  let received: { roundId: string; crashPoint: number } | null = null;
  const engine = new AviatorGameEngine({
    crashPointGenerator: { generate: () => 1.01 },
    timings: fastTimings,
    onCrash: (snapshot, crashPoint) => {
      received = { roundId: snapshot.roundId, crashPoint };
    },
  });

  engine.start();
  await new Promise((resolve) => setTimeout(resolve, 100));
  engine.stop();

  assert.ok(received);
  assert.equal(received.crashPoint, 1.01);
  assert.equal(received.roundId.length > 0, true);
});
