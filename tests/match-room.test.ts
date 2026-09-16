import test from "node:test";
import assert from "node:assert/strict";
import { decryptMatchRoomSecret, encryptMatchRoomSecret, normalizeMatchRoomValue } from "../lib/match-room";

test("match room values reject control characters and unsafe lengths", () => {
  assert.equal(normalizeMatchRoomValue("  room-123  "), "room-123");
  assert.equal(normalizeMatchRoomValue("room\n123"), null);
  assert.equal(normalizeMatchRoomValue("x".repeat(121)), null);
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
