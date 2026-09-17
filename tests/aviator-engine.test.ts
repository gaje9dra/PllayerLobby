import { describe, expect, test } from "vitest";
import { AviatorGameEngine } from "@/lib/games/aviator/engine";

describe("AviatorGameEngine", () => {
  test("starts in WAITING with a server-generated round", () => {
    const engine = new AviatorGameEngine({ now: () => 1_000 });
    const snapshot = engine.getSnapshot();
    expect(snapshot.phase).toBe("WAITING");
    expect(snapshot.multiplier).toBe(1);
    expect(snapshot.roundId).not.toBe("loading");
  });

  test("rejects invalid lifecycle transitions", () => {
    const engine = new AviatorGameEngine({ now: () => 1_000 });
    expect(() => engine.forceTransition("CRASHED")).toThrow("INVALID_STATE_TRANSITION");
  });

  test("uses the generated crash point without exposing it in snapshots", () => {
    const engine = new AviatorGameEngine({
      now: () => 1_000,
      crashPointGenerator: { generate: () => 2 },
    });
    expect(engine.getSnapshot()).not.toHaveProperty("crashPoint");
    expect(engine.getCrashPointForPersistence()).toBeNull();
  });
});
