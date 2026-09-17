import assert from "node:assert/strict";
import test from "node:test";
import { AviatorGameEngine } from "./engine";

test("aviator starts in waiting with a server-generated round", () => {
  const engine = new AviatorGameEngine({ now: () => 1_000 });
  const snapshot = engine.getSnapshot();
  assert.equal(snapshot.phase, "WAITING");
  assert.equal(snapshot.multiplier, 1);
  assert.notEqual(snapshot.roundId, "loading");
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
