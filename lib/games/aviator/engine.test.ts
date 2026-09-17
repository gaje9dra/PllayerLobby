import { describe, expect, test } from "vitest";
import { AviatorGameEngine } from "./engine";

describe("aviator lifecycle", () => {
  test("rejects impossible transitions", () => {
    const engine = new AviatorGameEngine({ now: () => 1000 });
    expect(() => engine.forceTransition("RUNNING")).not.toThrow();
    expect(() => engine.forceTransition("WAITING")).toThrow("INVALID_STATE_TRANSITION");
  });
});
