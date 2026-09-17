import assert from "node:assert/strict";
import test from "node:test";
import { eventForSnapshot } from "./events";
import type { AviatorRoundSnapshot } from "./types";

const snapshot: AviatorRoundSnapshot = {
  roundId: "round-1",
  phase: "RUNNING",
  serverTime: 1_000,
  multiplier: 1.25,
  startedAt: 900,
  waitingEndsAt: null,
  fairness: {
    roundId: "round-1",
    serverSeedHash: "a".repeat(64),
    clientSeed: "playerlobby-aviator-v1",
    nonce: "1",
    algorithmVersion: "v1",
  },
};

test("aviator emits a distinct round started event", () => {
  assert.equal(eventForSnapshot(snapshot, "WAITING").type, "round:started");
  assert.equal(eventForSnapshot(snapshot, "RUNNING").type, "multiplier:update");
});

test("aviator maps terminal phases to terminal events", () => {
  assert.equal(eventForSnapshot({ ...snapshot, phase: "WAITING" }).type, "round:waiting");
  assert.equal(eventForSnapshot({ ...snapshot, phase: "CRASHED" }).type, "round:crashed");
  assert.equal(eventForSnapshot({ ...snapshot, phase: "SETTLED" }).type, "round:settled");
});
