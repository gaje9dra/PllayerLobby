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

test("aviator completes a round and starts a fresh waiting round", async () => {
  const phases: string[] = [];
  const roundIds = new Set<string>();
  const engine = new AviatorGameEngine({
    crashPointGenerator: { generate: () => 1.01 },
    timings: fastTimings,
  });
  const unsubscribe = engine.subscribe((snapshot) => {
    phases.push(snapshot.phase);
    roundIds.add(snapshot.roundId);
  });

  engine.start();
  await new Promise((resolve) => setTimeout(resolve, 100));
  engine.stop();
  unsubscribe();

  assert.ok(phases.includes("WAITING"));
  assert.ok(phases.includes("RUNNING"));
  assert.ok(phases.includes("CRASHED"));
  assert.ok(phases.includes("SETTLED"));
  assert.ok(roundIds.size >= 2);
  assert.ok(["WAITING", "RUNNING"].includes(engine.getSnapshot().phase));
});

test("crash callback receives the authoritative final multiplier", async () => {
  let resolveCrash!: (value: { roundId: string; crashPoint: number }) => void;
  const crash = new Promise<{ roundId: string; crashPoint: number }>((resolve) => {
    resolveCrash = resolve;
  });

  const engine = new AviatorGameEngine({
    crashPointGenerator: { generate: () => 1.01 },
    timings: fastTimings,
    onCrash: (snapshot, crashPoint) => resolveCrash({ roundId: snapshot.roundId, crashPoint }),
  });

  engine.start();
  const received = await Promise.race([
    crash,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
  ]);
  engine.stop();

  assert.ok(received);
  assert.equal(received.crashPoint, 1.01);
  assert.equal(received.roundId.length > 0, true);
});


test("next round waits until the crashed round is persisted", async () => {
  let resolvePersistence!: () => void;
  let resolveCrashStarted!: () => void;
  const persistence = new Promise<void>((resolve) => { resolvePersistence = resolve; });
  const crashStarted = new Promise<void>((resolve) => { resolveCrashStarted = resolve; });
  const engine = new AviatorGameEngine({
    crashPointGenerator: { generate: () => 1.01 },
    timings: fastTimings,
    onCrash: async () => {
      resolveCrashStarted();
      return persistence;
    },
  });
  const crashedRoundId = engine.getSnapshot().roundId;

  engine.start();
  await Promise.race([
    crashStarted,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for crash")), 500)),
  ]);
  // Wait beyond the settled timer. The engine must remain on this crashed round
  // while the persistence promise is deliberately unresolved.
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(engine.getSnapshot().phase, "CRASHED");
  assert.equal(engine.getSnapshot().roundId, crashedRoundId);

  resolvePersistence();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.notEqual(engine.getSnapshot().roundId, crashedRoundId);
  assert.ok(["WAITING", "RUNNING"].includes(engine.getSnapshot().phase));
  engine.stop();
});
