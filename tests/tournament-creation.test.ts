import test from "node:test";
import assert from "node:assert/strict";
import { validateTournamentInput, slugify } from "../lib/tournament-validation.ts";
import { canAdminSetTournamentStatus } from "../lib/tournament-lifecycle-rules.ts";
import { TournamentStatus } from "../app/generated/prisma/client.ts";

function validValues() {
  return { gameId: "550e8400-e29b-41d4-a716-446655440000", name: "Friday Night Cup", slug: "friday-night-cup", description: "Open esports tournament", rules: "Play fair.", bannerUrl: "https://example.com/banner.png", startTime: "2030-01-10T20:00", registrationStartTime: "2030-01-10T18:00", registrationEndTime: "2030-01-10T19:30", entryFee: "50", prizePool: "5000", maxParticipants: "50", tournamentFormat: "SOLO", region: "IN", joiningWindowMinutes: "10" };
}

test("slugify produces a stable safe slug", () => {
  assert.equal(slugify("  Friday Night Cup!! "), "friday-night-cup");
});

test("valid tournament configuration has no validation errors", () => {
  assert.deepEqual(validateTournamentInput(validValues()), {});
});

test("invalid monetary values are rejected", () => {
  const values = validValues();
  values.entryFee = "10.999";
  values.prizePool = "-1";
  const errors = validateTournamentInput(values);
  assert.ok(errors.entryFee);
  assert.ok(errors.prizePool);
});

test("invalid schedule presence is rejected", () => {
  const values = validValues();
  values.registrationStartTime = "";
  values.registrationEndTime = "";
  values.startTime = "";
  const errors = validateTournamentInput(values);
  assert.ok(errors.registrationStartTime);
  assert.ok(errors.registrationEndTime);
  assert.ok(errors.startTime);
});

test("draft can be published to upcoming", () => {
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.DRAFT, TournamentStatus.UPCOMING, { status: TournamentStatus.DRAFT, startTime: new Date("2030-01-10T20:00:00Z"), registrationStartTime: new Date("2030-01-10T18:00:00Z"), registrationEndTime: new Date("2030-01-10T19:30:00Z") }, new Date("2029-01-01T00:00:00Z")), true);
});

test("invalid lifecycle jumps are rejected", () => {
  assert.equal(canAdminSetTournamentStatus(TournamentStatus.DRAFT, TournamentStatus.LIVE, { status: TournamentStatus.DRAFT, startTime: new Date("2030-01-10T20:00:00Z"), registrationStartTime: new Date("2030-01-10T18:00:00Z"), registrationEndTime: new Date("2030-01-10T19:30:00Z") }, new Date("2029-01-01T00:00:00Z")), false);
});
