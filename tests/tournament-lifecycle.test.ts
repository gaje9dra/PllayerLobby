import test from "node:test";
import assert from "node:assert/strict";
import { TournamentStatus } from "@/app/generated/prisma/client";
import {
  canAdminSetTournamentStatus,
  canTransitionTournamentStatus,
  getDueTournamentStatus,
  getEffectiveTournamentStatus,
} from "@/lib/tournament-lifecycle-rules";

const start = new Date("2026-09-10T12:00:00.000Z");
const registrationStart = new Date("2026-09-09T12:00:00.000Z");
const registrationEnd = new Date("2026-09-10T10:00:00.000Z");

function tournament(status: TournamentStatus) {
  return { status, registrationStartTime: registrationStart, registrationEndTime: registrationEnd, startTime: start };
}

test("DRAFT never auto-publishes", () => {
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.DRAFT), new Date("2026-09-09T13:00:00.000Z")), null);
  assert.equal(getEffectiveTournamentStatus(tournament(TournamentStatus.DRAFT), new Date("2026-09-11T13:00:00.000Z")), TournamentStatus.DRAFT);
});

test("UPCOMING opens registration at registrationStartTime", () => {
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.UPCOMING), new Date("2026-09-09T11:59:59.999Z")), null);
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.UPCOMING), registrationStart), TournamentStatus.REGISTRATION_OPEN);
});

test("REGISTRATION_OPEN closes at registrationEndTime", () => {
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.REGISTRATION_OPEN), new Date("2026-09-10T09:59:59.999Z")), null);
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.REGISTRATION_OPEN), registrationEnd), TournamentStatus.REGISTRATION_CLOSED);
});

test("REGISTRATION_CLOSED becomes LIVE at startTime", () => {
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.REGISTRATION_CLOSED), new Date("2026-09-10T11:59:59.999Z")), null);
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.REGISTRATION_CLOSED), start), TournamentStatus.LIVE);
});

test("LIVE does not auto-complete without an end time", () => {
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.LIVE), new Date("2030-01-01T00:00:00.000Z")), null);
  assert.equal(getEffectiveTournamentStatus(tournament(TournamentStatus.LIVE), new Date("2030-01-01T00:00:00.000Z")), TournamentStatus.LIVE);
});

test("effective status catches up multiple stale forward transitions", () => {
  assert.equal(getEffectiveTournamentStatus(tournament(TournamentStatus.UPCOMING), new Date("2026-09-11T13:00:00.000Z")), TournamentStatus.LIVE);
});

test("CANCELLED and COMPLETED have no automatic transitions", () => {
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.CANCELLED), new Date("2030-01-01T00:00:00.000Z")), null);
  assert.equal(getDueTournamentStatus(tournament(TournamentStatus.COMPLETED), new Date("2030-01-01T00:00:00.000Z")), null);
});

test("transition validator rejects impossible lifecycle jumps", () => {
  assert.equal(canTransitionTournamentStatus(TournamentStatus.DRAFT, TournamentStatus.UPCOMING), true);
  assert.equal(canTransitionTournamentStatus(TournamentStatus.UPCOMING, TournamentStatus.LIVE), false);
  assert.equal(canTransitionTournamentStatus(TournamentStatus.LIVE, TournamentStatus.DRAFT), false);
  assert.equal(canTransitionTournamentStatus(TournamentStatus.COMPLETED, TournamentStatus.LIVE), false);
  assert.equal(canTransitionTournamentStatus(TournamentStatus.CANCELLED, TournamentStatus.LIVE), false);
  assert.equal(canTransitionTournamentStatus(TournamentStatus.COMPLETED, TournamentStatus.CANCELLED), true);
});

test("admin may publish DRAFT, follow due lifecycle states, and complete LIVE manually", () => {
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.DRAFT, TournamentStatus.UPCOMING, tournament(TournamentStatus.DRAFT), new Date("2026-01-01T00:00:00.000Z")), true);
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.DRAFT, TournamentStatus.LIVE, tournament(TournamentStatus.DRAFT), start), false);
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.UPCOMING, TournamentStatus.REGISTRATION_OPEN, tournament(TournamentStatus.UPCOMING), new Date("2026-09-09T11:59:59.999Z")), false);
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.UPCOMING, TournamentStatus.REGISTRATION_OPEN, tournament(TournamentStatus.UPCOMING), registrationStart), true);
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.REGISTRATION_CLOSED, TournamentStatus.LIVE, tournament(TournamentStatus.REGISTRATION_CLOSED), start), true);
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.LIVE, TournamentStatus.COMPLETED, tournament(TournamentStatus.LIVE), new Date("2026-09-10T12:00:00.000Z")), true);
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.UPCOMING, TournamentStatus.CANCELLED, tournament(TournamentStatus.UPCOMING), new Date()), true);
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.COMPLETED, TournamentStatus.CANCELLED, tournament(TournamentStatus.COMPLETED), new Date()), true);
});
