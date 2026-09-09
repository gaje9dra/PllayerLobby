import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(32).toString("base64");

import { decryptPayoutData, encryptPayoutData } from "../lib/payout-crypto";

test("payout encryption round-trips plaintext", () => {
  const plaintext = JSON.stringify({ version: 1, type: "UPI", upiId: "player@example" });
  const encrypted = encryptPayoutData(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptPayoutData(encrypted), plaintext);
});

test("payout encryption uses authenticated ciphertext", () => {
  const encrypted = encryptPayoutData("sensitive");
  const [iv, tag, ciphertext] = encrypted.split(".");
  assert.equal(iv.length > 0, true);
  assert.equal(tag.length > 0, true);
  assert.equal(ciphertext.length > 0, true);
  assert.throws(() => decryptPayoutData(`${iv}.${tag}.${ciphertext.slice(0, -1)}x`));
});

test("payout encryption rejects malformed payloads", () => {
  assert.throws(() => decryptPayoutData("not-encrypted"));
  assert.throws(() => decryptPayoutData("a.b.c"));
});

test("payout encryption rejects an invalid key length", () => {
  const original = process.env.PAYOUT_ENCRYPTION_KEY;
  process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(16).toString("base64");
  assert.throws(() => encryptPayoutData("secret"));
  process.env.PAYOUT_ENCRYPTION_KEY = original;
});
