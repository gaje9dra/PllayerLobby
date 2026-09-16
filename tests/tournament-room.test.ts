import assert from "node:assert/strict";
import test from "node:test";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { getJoiningWindowStart, isJoiningWindowOpen, isParticipantMatchClosed, isParticipantMatchJoinable, isTournamentJoinableStatus } from "@/lib/tournament-room-rules";

const start = new Date("2026-09-10T14:30:00.000Z");

test("joining window opens configured minutes before tournament start", () => {
  const windowStart = getJoiningWindowStart(start, 10);
  assert.equal(windowStart.toISOString(), "2026-09-10T14:20:00.000Z");
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T14:19:59.999Z"), start, 10), false);
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T14:20:00.000Z"), start, 10), true);
  assert.equal(isJoiningWindowOpen(new Date("2026-09-10T14:29:59.999Z"), start, 10), true);
  assert.equal(isJoiningWindowOpen(start, start, 10), false);
});

test("joining window configuration clamps negative minutes to the tournament start", () => {
  assert.equal(getJoiningWindowStart(start, -10).toISOString(), start.toISOString());
  assert.equal(isJoiningWindowOpen(start, start, -10), true);
});

test("completed and cancelled tournaments are never joinable", () => {
  assert.equal(isTournamentJoinableStatus(TournamentStatus.CANCELLED), false);
  assert.equal(isTournamentJoinableStatus(TournamentStatus.COMPLETED), false);
  assert.equal(isTournamentJoinableStatus(TournamentStatus.DRAFT), false);
  assert.equal(isTournamentJoinableStatus(TournamentStatus.UPCOMING), true);
  assert.equal(isTournamentJoinableStatus(TournamentStatus.LIVE), true);
});

test("participant match lifecycle allows active states and blocks closed/unknown states", () => {
  for (const status of ["PENDING", "READY", "LIVE"]) assert.equal(isParticipantMatchJoinable(status), true);
  for (const status of ["COMPLETED", "CANCELLED", "UNKNOWN"]) assert.equal(isParticipantMatchJoinable(status), false);
  assert.equal(isParticipantMatchClosed("COMPLETED"), true);
  assert.equal(isParticipantMatchClosed("CANCELLED"), true);
  assert.equal(isParticipantMatchClosed("LIVE"), false);
});
