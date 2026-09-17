import assert from "node:assert/strict";
import test from "node:test";
import { errorResponse, isAviatorClientMessage } from "./state";

test("aviator accepts only round sync messages", () => {
  assert.equal(isAviatorClientMessage({ type: "round:sync" }), true);
  assert.equal(isAviatorClientMessage({ type: "round:sync", roundId: "round-1" }), true);
  assert.equal(isAviatorClientMessage({ type: "round:sync", roundId: 123 }), false);
  assert.equal(isAviatorClientMessage({ type: "bet", amount: 10 }), false);
  assert.equal(isAviatorClientMessage(null), false);
  assert.equal(isAviatorClientMessage([]), false);
});

test("aviator error codes remain explicit and non-sensitive", () => {
  assert.deepEqual(errorResponse("STALE_ROUND"), { error: "STALE_ROUND" });
  assert.deepEqual(errorResponse("INVALID_MESSAGE"), { error: "INVALID_MESSAGE" });
  assert.deepEqual(errorResponse("WEBSOCKET_NOT_AUTHORIZED"), { error: "WEBSOCKET_NOT_AUTHORIZED" });
});
