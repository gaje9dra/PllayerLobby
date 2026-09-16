import test from "node:test";
import assert from "node:assert/strict";
import { getRegistrationReference } from "@/lib/registration-reference";

test("registration reference is stable and does not expose the database UUID", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const reference = getRegistrationReference(id);

  assert.match(reference, /^PL-REG-[A-F0-9]{16}$/);
  assert.equal(reference, getRegistrationReference(id));
  assert.equal(reference.includes(id), false);
});

test("different registration IDs receive different support references for normal UUID inputs", () => {
  const first = getRegistrationReference("550e8400-e29b-41d4-a716-446655440000");
  const second = getRegistrationReference("550e8400-e29b-41d4-a716-446655440001");
  assert.notEqual(first, second);
});
