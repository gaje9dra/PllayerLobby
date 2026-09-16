import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRegistrationEligibility,
  getRemainingSlots,
} from "@/lib/registration-eligibility-rules";
import {
  getDueTournamentStatus,
  getEffectiveTournamentStatus,
} from "@/lib/tournament-lifecycle-rules";
import { RegistrationStatus, TournamentStatus, UserRole, UserStatus } from "@/app/generated/prisma/client";

const registrationStart = new Date("2030-01-10T18:00:00.000Z");
const registrationEnd = new Date("2030-01-10T19:50:00.000Z");
const tournamentStart = new Date("2030-01-10T20:00:00.000Z");
const user = { role: UserRole.USER, status: UserStatus.ACTIVE };
const tournament = {
  status: TournamentStatus.REGISTRATION_OPEN,
  registrationStartTime: registrationStart,
  registrationEndTime: registrationEnd,
  maxParticipants: 50,
};

test("registration is open at the exact opening instant", () => {
  assert.deepEqual(
    evaluateRegistrationEligibility({ user, tournament, registration: null, confirmedParticipants: 0, now: registrationStart }),
    { allowed: true },
  );
});

test("registration is closed at the exact closing instant", () => {
  assert.deepEqual(
    evaluateRegistrationEligibility({ user, tournament, registration: null, confirmedParticipants: 0, now: registrationEnd }),
    { allowed: false, reason: "REGISTRATION_CLOSED" },
  );
});

test("registration cannot exceed the participant limit", () => {
  assert.deepEqual(
    evaluateRegistrationEligibility({ user, tournament, registration: null, confirmedParticipants: 50, now: new Date("2030-01-10T19:00:00.000Z") }),
    { allowed: false, reason: "TOURNAMENT_FULL" },
  );
  assert.equal(getRemainingSlots(50, 50), 0);
});

test("an overdue tournament catches up to LIVE without a browser timer", () => {
  const input = {
    status: TournamentStatus.UPCOMING,
    registrationStartTime: registrationStart,
    registrationEndTime: registrationEnd,
    startTime: tournamentStart,
  };
  assert.equal(getDueTournamentStatus(input, new Date("2030-01-10T20:00:00.000Z")), TournamentStatus.REGISTRATION_OPEN);
  assert.equal(getEffectiveTournamentStatus(input, new Date("2030-01-10T20:00:00.000Z")), TournamentStatus.LIVE);
});

test("a cancelled registration does not bypass the authoritative window", () => {
  assert.deepEqual(
    evaluateRegistrationEligibility({
      user,
      tournament,
      registration: { status: RegistrationStatus.CANCELLED },
      confirmedParticipants: 0,
      now: registrationEnd,
    }),
    { allowed: false, reason: "REGISTRATION_CLOSED" },
  );
});
