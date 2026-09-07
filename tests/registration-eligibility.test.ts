import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRegistrationEligibility,
  getRemainingSlots,
  REGISTRATION_ELIGIBILITY_REASONS,
} from "@/lib/registration-eligibility";
import {
  RegistrationStatus,
  TournamentStatus,
  UserRole,
  UserStatus,
} from "@/app/generated/prisma/client";

const now = new Date("2026-09-07T12:00:00.000Z");
const tournament = {
  status: TournamentStatus.REGISTRATION_OPEN,
  registrationStartTime: new Date("2026-09-07T11:00:00.000Z"),
  registrationEndTime: new Date("2026-09-07T13:00:00.000Z"),
  maxParticipants: 100,
};
const activeUser = { role: UserRole.USER, status: UserStatus.ACTIVE };

function evaluate(overrides: Partial<Parameters<typeof evaluateRegistrationEligibility>[0]> = {}) {
  return evaluateRegistrationEligibility({
    user: activeUser,
    tournament,
    registration: null,
    confirmedParticipants: 0,
    now,
    ...overrides,
  });
}

test("active authenticated USER can be eligible", () => {
  assert.deepEqual(evaluate(), { allowed: true });
});

test("unauthenticated user is rejected", () => {
  assert.deepEqual(evaluate({ user: null }), {
    allowed: false,
    reason: REGISTRATION_ELIGIBILITY_REASONS.UNAUTHENTICATED,
  });
});

test("suspended user is rejected", () => {
  assert.deepEqual(evaluate({ user: { ...activeUser, status: UserStatus.SUSPENDED } }), {
    allowed: false,
    reason: REGISTRATION_ELIGIBILITY_REASONS.USER_NOT_ACTIVE,
  });
});

test("banned user is rejected", () => {
  assert.deepEqual(evaluate({ user: { ...activeUser, status: UserStatus.BANNED } }), {
    allowed: false,
    reason: REGISTRATION_ELIGIBILITY_REASONS.USER_NOT_ACTIVE,
  });
});

test("ADMIN does not bypass registration restrictions", () => {
  assert.deepEqual(evaluate({ user: { role: UserRole.ADMIN, status: UserStatus.ACTIVE } }), {
    allowed: false,
    reason: REGISTRATION_ELIGIBILITY_REASONS.USER_ROLE_NOT_ALLOWED,
  });
});

for (const status of [
  TournamentStatus.DRAFT,
  TournamentStatus.UPCOMING,
  TournamentStatus.REGISTRATION_CLOSED,
  TournamentStatus.LIVE,
  TournamentStatus.COMPLETED,
  TournamentStatus.CANCELLED,
]) {
  test(`${status} tournament is rejected`, () => {
    assert.deepEqual(
      evaluate({ tournament: { ...tournament, status } }),
      { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_NOT_OPEN },
    );
  });
}

test("REGISTRATION_OPEN tournament can be eligible", () => {
  assert.deepEqual(evaluate({ tournament: { ...tournament, status: TournamentStatus.REGISTRATION_OPEN } }), {
    allowed: true,
  });
});

test("registration before registrationStartTime is rejected", () => {
  assert.deepEqual(
    evaluate({ now: new Date("2026-09-07T10:59:59.999Z") }),
    { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_NOT_STARTED },
  );
});

test("registration at registrationStartTime is allowed", () => {
  assert.deepEqual(
    evaluate({ now: tournament.registrationStartTime! }),
    { allowed: true },
  );
});

test("registration at registrationEndTime is rejected", () => {
  assert.deepEqual(
    evaluate({ now: tournament.registrationEndTime! }),
    { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_CLOSED },
  );
});

test("registration after registrationEndTime is rejected", () => {
  assert.deepEqual(
    evaluate({ now: new Date("2026-09-07T13:00:00.001Z") }),
    { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_CLOSED },
  );
});

test("tournament at capacity is rejected", () => {
  assert.deepEqual(evaluate({ confirmedParticipants: 100 }), {
    allowed: false,
    reason: REGISTRATION_ELIGIBILITY_REASONS.TOURNAMENT_FULL,
  });
});

test("tournament with available capacity is eligible", () => {
  assert.deepEqual(evaluate({ confirmedParticipants: 99 }), { allowed: true });
});

test("existing pending registration is rejected", () => {
  assert.deepEqual(evaluate({ registration: { status: RegistrationStatus.PENDING } }), {
    allowed: false,
    reason: REGISTRATION_ELIGIBILITY_REASONS.ALREADY_REGISTERED,
  });
});

test("existing confirmed registration is rejected", () => {
  assert.deepEqual(evaluate({ registration: { status: RegistrationStatus.CONFIRMED } }), {
    allowed: false,
    reason: REGISTRATION_ELIGIBILITY_REASONS.ALREADY_REGISTERED,
  });
});

test("cancelled previous registration can be eligible again", () => {
  assert.deepEqual(evaluate({ registration: { status: RegistrationStatus.CANCELLED } }), {
    allowed: true,
  });
});

test("missing tournament is rejected", () => {
  assert.deepEqual(evaluate({ tournament: null }), {
    allowed: false,
    reason: REGISTRATION_ELIGIBILITY_REASONS.TOURNAMENT_NOT_FOUND,
  });
});

test("remaining slots never become negative", () => {
  assert.equal(getRemainingSlots(100, 72), 28);
  assert.equal(getRemainingSlots(100, 100), 0);
  assert.equal(getRemainingSlots(100, 125), 0);
});

test("unlimited tournament capacity returns null remaining slots", () => {
  assert.equal(getRemainingSlots(null, 1000), null);
});
