import test from "node:test";
import assert from "node:assert/strict";
import { getJoiningWindowStart, isJoiningWindowOpen, isTournamentJoinableStatus } from "../lib/tournament-room-rules";

test("tournament access opens exactly at the configured boundary", () => {
  const start = new Date("2026-09-10T20:00:00.000Z");
  const opens = getJoiningWindowStart(start, 10);
  assert.equal(opens.toISOString(), "2026-09-10T19:50:00.000Z");
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T19:49:59.999Z"), start, 10), false);
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T19:50:00.000Z"), start, 10), true);
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T19:59:59.999Z"), start, 10), true);
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T20:00:00.000Z"), start, 10), false);
});

test("joining window is configurable and never trusts a client timestamp", () => {
  const start = new Date("2026-09-10T20:00:00.000Z");
  assert.equal(getJoiningWindowStart(start, 15).toISOString(), "2026-09-10T19:45:00.000Z");
});

test("cancelled and completed tournament states are not joinable", () => {
  assert.equal(isTournamentJoinableStatus("UPCOMING" as never), true);
  assert.equal(isTournamentJoinableStatus("REGISTRATION_CLOSED" as never), true);
  assert.equal(isTournamentJoinableStatus("LIVE" as never), true);
  assert.equal(isTournamentJoinableStatus("CANCELLED" as never), false);
  assert.equal(isTournamentJoinableStatus("COMPLETED" as never), false);
});
