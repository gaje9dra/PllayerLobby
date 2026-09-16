import test from "node:test";
import assert from "node:assert/strict";
import { validateGameSpecificConfig } from "../lib/game-specific-config";

const valorant = { version: 1, format: "5V5", teamSize: 5, gameMode: "COMPETITIVE", map: "ANY", rounds: 3, scoring: { win: 3, loss: 0 } };
const stumble = { version: 1, format: "SOLO", participantStructure: "INDIVIDUAL", rounds: 3, gameMode: "RACE", scoring: { first: 10, second: 7, third: 5 } };

test("game configuration has no duplicate financial fields", () => {
  assert.equal(validateGameSpecificConfig("VALORANT", valorant).ok, true);
  assert.equal(validateGameSpecificConfig("STUMBLE_GUYS", stumble).ok, true);
  assert.equal("entryFee" in valorant, false);
  assert.equal("prizePool" in valorant, false);
  assert.equal("entryFee" in stumble, false);
  assert.equal("prizePool" in stumble, false);
});

test("financial-looking fields are rejected as unexpected configuration", () => {
  assert.equal(validateGameSpecificConfig("VALORANT", { ...valorant, entryFee: 100 }).ok, false);
  assert.equal(validateGameSpecificConfig("STUMBLE_GUYS", { ...stumble, prizePool: 5000 }).ok, false);
});
