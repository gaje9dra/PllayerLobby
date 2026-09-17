import { expect, test } from "vitest";
import { isAviatorClientMessage, isAviatorPhase } from "@/lib/games/aviator/state";

test("accepts only supported aviator phases", () => {
  expect(isAviatorPhase("WAITING")).toBe(true);
  expect(isAviatorPhase("RUNNING")).toBe(true);
  expect(isAviatorPhase("CRASHED")).toBe(true);
  expect(isAviatorPhase("SETTLED")).toBe(true);
  expect(isAviatorPhase("BETTING")).toBe(false);
});

test("validates the only phase-10.1 client message", () => {
  expect(isAviatorClientMessage({ type: "round:sync" })).toBe(true);
  expect(isAviatorClientMessage({ type: "round:sync", roundId: "round" })).toBe(true);
  expect(isAviatorClientMessage({ type: "round:start" })).toBe(false);
  expect(isAviatorClientMessage({ type: "round:sync", roundId: 42 })).toBe(false);
});
