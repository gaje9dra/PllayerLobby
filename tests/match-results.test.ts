import assert from "node:assert/strict";
import test from "node:test";
import { validateMatchResultInput, validateResultStateTransition } from "@/lib/match-results";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("valid result accepts only participant-shaped score data", () => {
  assert.deepEqual(validateMatchResultInput({ winnerRegistrationId: A, scores: { [A]: 10, [B]: 7 } }), { winnerRegistrationId: A, scores: { [A]: 10, [B]: 7 } });
});

test("winner must be represented in scores", () => {
  assert.throws(() => validateMatchResultInput({ winnerRegistrationId: A, scores: { [B]: 7 } }), /INVALID_WINNER/);
});

test("malformed and unsafe scores are rejected", () => {
  assert.throws(() => validateMatchResultInput({ winnerRegistrationId: A, scores: { [A]: -1, [B]: 2 } }), /INVALID_SCORE/);
  assert.throws(() => validateMatchResultInput({ winnerRegistrationId: A, scores: { [A]: Number.POSITIVE_INFINITY } }), /INVALID_SCORE/);
  assert.throws(() => validateMatchResultInput({ winnerRegistrationId: A, scores: { [A]: 1, [C]: 2 } }), /INVALID_RESULT|INVALID_SCORE|INVALID_WINNER/);
});

test("result lifecycle allows review but not silent rewrites", () => {
  assert.equal(validateResultStateTransition("PENDING", "VERIFIED"), true);
  assert.equal(validateResultStateTransition("PENDING", "REJECTED"), true);
  assert.equal(validateResultStateTransition("PENDING", "DISPUTED"), true);
  assert.equal(validateResultStateTransition("DISPUTED", "VERIFIED"), true);
  assert.equal(validateResultStateTransition("VERIFIED", "PENDING"), false);
  assert.equal(validateResultStateTransition("REJECTED", "VERIFIED"), false);
});

test("financial state is intentionally outside the result lifecycle", () => {
  assert.equal(validateResultStateTransition("PENDING", "VERIFIED"), true);
  assert.equal(validateResultStateTransition("VERIFIED", "CREDITED"), false);
});
