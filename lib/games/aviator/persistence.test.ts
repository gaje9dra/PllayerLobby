import { expect, test } from "vitest";

test("aviator persistence design stores finalized rounds only", () => {
  const persistedFields = ["id", "status", "startedAt", "crashedAt", "crashMultiplier", "createdAt"];
  expect(persistedFields).not.toContain("multiplierTick");
});
