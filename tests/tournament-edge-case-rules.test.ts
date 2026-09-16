import test from "node:test";
import assert from "node:assert/strict";
import { canAbandonMatch, canCancelMatch, canCancelTournament, canSubmitNormalResult, safeEdgeCaseMessage } from "../lib/tournament-edge-case-rules";

test("tournament cancellation accepts historical states but not already cancelled", () => {
  for (const status of ["DRAFT", "UPCOMING", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "LIVE", "COMPLETED"]) assert.equal(canCancelTournament(status), true, status);
  assert.equal(canCancelTournament("CANCELLED"), false);
});

test("match cancellation and abandonment are state-aware", () => {
  assert.equal(canCancelMatch("PENDING"), true);
  assert.equal(canCancelMatch("LIVE"), true);
  assert.equal(canCancelMatch("ABANDONED"), true);
  assert.equal(canCancelMatch("COMPLETED"), false);
  assert.equal(canAbandonMatch("LIVE"), true);
  assert.equal(canAbandonMatch("READY"), true);
  assert.equal(canAbandonMatch("PENDING"), false);
  assert.equal(canAbandonMatch("COMPLETED"), false);
});

test("normal results are blocked after terminal or abandoned states", () => {
  assert.equal(canSubmitNormalResult("READY", "LIVE"), true);
  assert.equal(canSubmitNormalResult("LIVE", "LIVE"), true);
  for (const status of ["COMPLETED", "CANCELLED", "ABANDONED"]) assert.equal(canSubmitNormalResult(status, "LIVE"), false, status);
  assert.equal(canSubmitNormalResult("READY", "CANCELLED"), false);
});

test("edge-case user messages are safe and deterministic", () => {
  assert.equal(safeEdgeCaseMessage("CANCELLED_TOURNAMENT"), "This tournament has been cancelled.");
  assert.equal(safeEdgeCaseMessage("CANCELLED_MATCH"), "This match has been cancelled.");
  assert.equal(safeEdgeCaseMessage("ROOM_UNAVAILABLE"), "Room details are not available yet.");
  assert.equal(safeEdgeCaseMessage("UNKNOWN"), "The requested operation could not be completed.");
});
