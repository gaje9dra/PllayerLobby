import test from "node:test";
import assert from "node:assert/strict";
import { getRegistrationReference, registrationIdFromReference } from "@/lib/registration-reference";

test("registration reference is stable and does not render the raw database UUID", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const reference = getRegistrationReference(id);

  assert.match(reference, /^PL-REG-[A-Za-z0-9_-]{22}$/);
  assert.equal(reference, getRegistrationReference(id));
  assert.equal(reference.includes(id), false);
  assert.equal(registrationIdFromReference(reference), id);
});

test("different registration IDs receive different support references", () => {
  const firstId = "550e8400-e29b-41d4-a716-446655440000";
  const secondId = "550e8400-e29b-41d4-a716-446655440001";
  const first = getRegistrationReference(firstId);
  const second = getRegistrationReference(secondId);
  assert.notEqual(first, second);
  assert.equal(registrationIdFromReference(second), secondId);
});

test("invalid registration references are rejected", () => {
  assert.equal(registrationIdFromReference("PL-REG-invalid"), null);
  assert.equal(registrationIdFromReference("PL-REG-AAAAAAAAAAAAAAAAAAAAAA"), null);
});
