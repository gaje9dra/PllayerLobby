import assert from "node:assert/strict";
import test from "node:test";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { getJoiningWindowStart, isJoiningWindowOpen, isTournamentJoinableStatus } from "@/lib/tournament-room-rules";

const start = new Date("2026-09-10T14:30:00.000Z");

test("joining window opens configured minutes before tournament start", () => {
  const windowStart = getJoiningWindowStart(start, 10);
  assert.equal(windowStart.toISOString(), "2026-09-10T14:20:00.000Z");
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T14:19:59.999Z"), start, 10), false);
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T14:20:00.000Z"), start, 10), true);
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T14:29:59.999Z"), start, 10), true);
  assert.equal(isJoiningWindowOpen(start, start, 10), false);
});

test("completed and cancelled tournaments are never joinable", () => {
  assert.equal(isTournamentJoinableStatus(TournamentStatus.CANCELLED), false);
  assert.equal(isTournamentJoinableStatus(TournamentStatus.COMPLETED), false);
  assert.equal(isTournamentJoinableStatus(TournamentStatus.DRAFT), false);
  assert.equal(isTournamentJoinableStatus(TournamentStatus.UPCOMING), true);
  assert.equal(isTournamentJoinableStatus(TournamentStatus.LIVE), true);
});
