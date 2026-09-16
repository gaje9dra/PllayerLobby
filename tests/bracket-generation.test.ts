import test from "node:test";
import assert from "node:assert/strict";
import { buildSingleEliminationPlan } from "../lib/bracket-plan";
import { canGenerateBracket, isSupportedBracketFormat, nextPowerOfTwo, validateGenerationParticipantCount } from "../lib/bracket-rules";

function participants(count: number) {
  return Array.from({ length: count }, (_, index) => ({ registrationId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, seed: index + 1 }));
}

test("single elimination creates the correct 2 participant structure", () => {
  const plan = buildSingleEliminationPlan(participants(2));
  assert.equal(plan.length, 1);
  assert.equal(plan[0].matches.length, 1);
  assert.equal(plan[0].matches[0].slots.filter((slot) => slot.registrationId).length, 2);
});

test("single elimination creates correct rounds for powers of two", () => {
  for (const count of [4, 8, 16]) {
    const plan = buildSingleEliminationPlan(participants(count));
    assert.equal(plan[0].matches.length, count / 2);
    assert.equal(plan.at(-1)?.matches.length, 1);
    assert.equal(plan.flatMap((round) => round.matches).length, count - 1);
  }
});

test("non-power-of-two counts use structural byes without losing participants", () => {
  for (const count of [3, 6, 10, 12, 14]) {
    const plan = buildSingleEliminationPlan(participants(count));
    const firstRound = plan[0];
    const assigned = firstRound.matches.flatMap((match) => match.slots.filter((slot) => slot.registrationId));
    const byes = firstRound.matches.flatMap((match) => match.slots.filter((slot) => slot.isBye));
    assert.equal(assigned.length, count);
    assert.equal(byes.length, Math.pow(2, Math.ceil(Math.log2(count))) / 2 - (count - Math.pow(2, Math.ceil(Math.log2(count))) / 2));
    assert.equal(new Set(assigned.map((slot) => slot.registrationId)).size, count);
  }
});

test("winner progression relationships are represented by source match numbers", () => {
  const plan = buildSingleEliminationPlan(participants(8));
  assert.deepEqual(plan[1].matches[0].slots.map((slot) => slot.sourceMatchNumber), [1, 2]);
  assert.deepEqual(plan[2].matches[0].slots.map((slot) => slot.sourceMatchNumber), [1, 2]);
});

test("generation is idempotency-ready because the planner is deterministic for a supplied participant order", () => {
  const input = participants(6);
  assert.deepEqual(buildSingleEliminationPlan(input), buildSingleEliminationPlan(input));
});

test("supported formats and lifecycle guards are explicit", () => {
  assert.equal(isSupportedBracketFormat("SINGLE_ELIMINATION"), true);
  assert.equal(isSupportedBracketFormat("ROUND_ROBIN"), false);
  assert.equal(canGenerateBracket("UPCOMING"), true);
  assert.equal(canGenerateBracket("REGISTRATION_OPEN"), true);
  assert.equal(canGenerateBracket("REGISTRATION_CLOSED"), true);
  assert.equal(canGenerateBracket("LIVE"), false);
});

test("participant validation enforces the minimum and configured maximum", () => {
  assert.equal(nextPowerOfTwo(10), 16);
  assert.doesNotThrow(() => validateGenerationParticipantCount(2, 10));
  assert.throws(() => validateGenerationParticipantCount(1, 10), /INSUFFICIENT_PARTICIPANTS/);
  assert.throws(() => validateGenerationParticipantCount(11, 10), /PARTICIPANT_COUNT_EXCEEDS_MAXIMUM/);
});
