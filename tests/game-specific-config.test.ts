import test from "node:test";
import assert from "node:assert/strict";
import { publicGameConfigSummary, validateGameSpecificConfig } from "../lib/game-specific-config";

const valorant = { version: 1, format: "5V5", teamSize: 5, gameMode: "COMPETITIVE", map: "ANY", rounds: 3, scoring: { win: 3, loss: 0 } } as const;
const stumble = { version: 1, format: "SOLO", participantStructure: "INDIVIDUAL", rounds: 3, gameMode: "RACE", scoring: { first: 10, second: 7, third: 5 } } as const;

test("Valorant configuration is accepted and summarized", () => {
  const result = validateGameSpecificConfig("VALORANT", valorant);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.config, valorant);
  assert.equal(publicGameConfigSummary("VALORANT", valorant)?.[1][1], "5v5");
});

test("Stumble Guys configuration is accepted and summarized", () => {
  const result = validateGameSpecificConfig("STUMBLE_GUYS", stumble);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.config, stumble);
  assert.equal(publicGameConfigSummary("STUMBLE_GUYS", stumble)?.[1][1], "INDIVIDUAL");
});

test("Valorant rejects an incompatible team size", () => {
  const result = validateGameSpecificConfig("VALORANT", { ...valorant, teamSize: 3 });
  assert.equal(result.ok, false);
});

test("Stumble Guys rejects an unsupported round count", () => {
  const result = validateGameSpecificConfig("STUMBLE_GUYS", { ...stumble, rounds: 11 });
  assert.equal(result.ok, false);
});

test("cross-game fields are rejected", () => {
  const result = validateGameSpecificConfig("VALORANT", { ...valorant, participantStructure: "TEAM" });
  assert.equal(result.ok, false);
});

test("malformed and unsafe configuration is rejected", () => {
  assert.equal(validateGameSpecificConfig("VALORANT", null).ok, false);
  assert.equal(validateGameSpecificConfig("VALORANT", { ...valorant, format: "<script>" }).ok, false);
  assert.equal(validateGameSpecificConfig("UNKNOWN_GAME", valorant).ok, false);
});
