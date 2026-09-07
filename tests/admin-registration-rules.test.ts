import assert from "node:assert/strict";
import test from "node:test";
import {
  canAdminCancelRegistration,
  parseAdminRegistrationPage,
  parseAdminRegistrationSearch,
  parseAdminRegistrationSort,
  parsePaymentStatus,
  parseRegistrationStatus,
  parseUserStatus,
} from "@/lib/admin-registration-rules";
import { PaymentStatus, RegistrationStatus, TournamentStatus, UserStatus } from "@/app/generated/prisma/client";

test("admin registration query parsing accepts only known enum values", () => {
  assert.equal(parseRegistrationStatus("CONFIRMED"), RegistrationStatus.CONFIRMED);
  assert.equal(parseRegistrationStatus("not-real"), undefined);
  assert.equal(parsePaymentStatus("SUCCESS"), PaymentStatus.SUCCESS);
  assert.equal(parsePaymentStatus("not-real"), undefined);
  assert.equal(parseUserStatus("SUSPENDED"), UserStatus.SUSPENDED);
  assert.equal(parseUserStatus("not-real"), undefined);
});

test("admin registration search and pagination are bounded", () => {
  assert.equal(parseAdminRegistrationSearch("  player@example.com  "), "player@example.com");
  assert.equal(parseAdminRegistrationSearch("x".repeat(150)).length, 100);
  assert.equal(parseAdminRegistrationPage("4"), 4);
  assert.equal(parseAdminRegistrationPage("-2"), 1);
  assert.equal(parseAdminRegistrationPage("not-a-number"), 1);
});

test("admin registration sorting is allowlisted", () => {
  assert.equal(parseAdminRegistrationSort("participant_asc"), "participant_asc");
  assert.equal(parseAdminRegistrationSort("status"), "status");
  assert.equal(parseAdminRegistrationSort("user.password"), "newest");
});

test("admin cancellation allows pending and confirmed registrations only", () => {
  assert.equal(canAdminCancelRegistration(TournamentStatus.REGISTRATION_OPEN, RegistrationStatus.PENDING), true);
  assert.equal(canAdminCancelRegistration(TournamentStatus.LIVE, RegistrationStatus.CONFIRMED), true);
  assert.equal(canAdminCancelRegistration(TournamentStatus.REGISTRATION_OPEN, RegistrationStatus.CANCELLED), false);
  assert.equal(canAdminCancelRegistration(TournamentStatus.COMPLETED, RegistrationStatus.CONFIRMED), false);
  assert.equal(canAdminCancelRegistration(TournamentStatus.CANCELLED, RegistrationStatus.PENDING), false);
});
