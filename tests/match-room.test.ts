import test from "node:test";
import assert from "node:assert/strict";
import { decryptMatchRoomSecret, encryptMatchRoomSecret } from "../lib/match-room-crypto";
import { MAX_ROOM_ID_LENGTH, normalizeMatchRoomValue } from "../lib/match-room-input";
import { canParticipantAccessMatchRoom, isEligibleMatchRegistration } from "../lib/match-room-rules";

test("match room values reject control characters and unsafe lengths", () => {
  assert.equal(normalizeMatchRoomValue("  room-123  "), "room-123");
  assert.equal(normalizeMatchRoomValue("room\n123"), null);
  assert.equal(normalizeMatchRoomValue("x".repeat(MAX_ROOM_ID_LENGTH + 1)), null);
});

test("match room secrets use authenticated encryption and round-trip", () => {
  process.env.AUTH_SECRET = "phase-9-7-test-secret";
  const plaintext = "Room Password ABCD1234";
  const encrypted = encryptMatchRoomSecret(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptMatchRoomSecret(encrypted), plaintext);
  assert.throws(() => decryptMatchRoomSecret(`${encrypted.slice(0, -1)}x`));
});

test("encrypted match room payload is not plaintext", () => {
  process.env.AUTH_SECRET = "phase-9-7-test-secret";
  const plaintext = "12345678";
  assert.equal(encryptMatchRoomSecret(plaintext).includes(plaintext), false);
});

test("participant access allows only live-compatible match states", () => {
  assert.equal(canParticipantAccessMatchRoom("LIVE", "READY"), true);
  assert.equal(canParticipantAccessMatchRoom("REGISTRATION_CLOSED", "PENDING"), true);
  assert.equal(canParticipantAccessMatchRoom("DRAFT", "READY"), false);
  assert.equal(canParticipantAccessMatchRoom("CANCELLED", "LIVE"), false);
  assert.equal(canParticipantAccessMatchRoom("LIVE", "COMPLETED"), false);
  assert.equal(canParticipantAccessMatchRoom("LIVE", "CANCELLED"), false);
});

test("participant eligibility requires every server-side condition", () => {
  const base = { authenticated: true, userActive: true, registrationConfirmed: true, registrationBelongsToTournament: true, registrationOccupiesMatch: true };
  assert.equal(isEligibleMatchRegistration(base), true);
  for (const key of Object.keys(base) as Array<keyof typeof base>) {
    assert.equal(isEligibleMatchRegistration({ ...base, [key]: false }), false, key);
  }
});
