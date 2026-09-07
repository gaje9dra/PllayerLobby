import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationStatus } from "@/app/generated/prisma/client";
import { getRegistrationCreationStatus } from "@/lib/registration-workflow-rules";

test("free tournament registrations become CONFIRMED", () => {
  const result = getRegistrationCreationStatus({ toFixed: () => "0.00" });

  assert.deepEqual(result, {
    status: RegistrationStatus.CONFIRMED,
    paymentRequired: false,
  });
});

test("paid tournament registrations remain PENDING", () => {
  const result = getRegistrationCreationStatus({ toFixed: () => "50.00" });

  assert.deepEqual(result, {
    status: RegistrationStatus.PENDING,
    paymentRequired: true,
  });
});

test("entry fee is classified from the server-side monetary value", () => {
  const result = getRegistrationCreationStatus({ toFixed: () => "0.01" });

  assert.equal(result.status, RegistrationStatus.PENDING);
  assert.equal(result.paymentRequired, true);
});
