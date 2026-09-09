import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { decryptPayoutDataWithKey, encryptPayoutDataWithKey } from "../lib/payout-crypto-core";
import { validatePayoutDestinationInput } from "../lib/payout-destination-validation";

const key = randomBytes(32);
const validUpi = (upiId = "player@upi") => ({ type: "UPI" as const, displayName: "UPI", upiId });
const validBank = (overrides: Partial<{ displayName: string; accountHolderName: string; accountNumber: string; ifsc: string; bankName: string }> = {}) => ({
  type: "BANK_ACCOUNT" as const,
  displayName: "Bank",
  accountHolderName: "Gajendra Singh",
  accountNumber: "1234567890",
  ifsc: "ABCD0123456",
  bankName: "Example Bank",
  ...overrides,
});

test("payout encryption round-trips plaintext", () => {
  const plaintext = JSON.stringify({ version: 1, type: "UPI", upiId: "player@example" });
  const encrypted = encryptPayoutDataWithKey(plaintext, key);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptPayoutDataWithKey(encrypted, key), plaintext);
});

test("payout encryption uses authenticated ciphertext", () => {
  const encrypted = encryptPayoutDataWithKey("sensitive", key);
  const [iv, tag, ciphertext] = encrypted.split(".");
  assert.equal(iv.length > 0, true);
  assert.equal(tag.length > 0, true);
  assert.equal(ciphertext.length > 0, true);
  assert.throws(() => decryptPayoutDataWithKey(`${iv}.${tag}.${ciphertext.slice(0, -1)}x`, key));
});

test("payout encryption rejects malformed payloads", () => {
  assert.throws(() => decryptPayoutDataWithKey("not-encrypted", key));
  assert.throws(() => decryptPayoutDataWithKey("a.b.c", key));
});

test("payout encryption rejects an invalid key length", () => {
  assert.throws(() => encryptPayoutDataWithKey("secret", randomBytes(16)));
});

test("payout encryption handles empty plaintext", () => {
  const encrypted = encryptPayoutDataWithKey("", key);
  assert.equal(decryptPayoutDataWithKey(encrypted, key), "");
});

test("payout encryption handles unicode plaintext", () => {
  const plaintext = "नमस्ते 🔐";
  const encrypted = encryptPayoutDataWithKey(plaintext, key);
  assert.equal(decryptPayoutDataWithKey(encrypted, key), plaintext);
});

test("payout encryption fails with the wrong key", () => {
  const encrypted = encryptPayoutDataWithKey("secret", key);
  assert.throws(() => decryptPayoutDataWithKey(encrypted, randomBytes(32)));
});

test("payout encryption produces different IVs", () => {
  const first = encryptPayoutDataWithKey("same", key).split(".")[0];
  const second = encryptPayoutDataWithKey("same", key).split(".")[0];
  assert.notEqual(first, second);
});

test("valid UPI destination is normalized and masked", () => {
  const result = validatePayoutDestinationInput({ type: "UPI", displayName: "Primary UPI", upiId: "GaJ-01@UPI" });
  assert.equal(result?.data.type, "UPI");
  assert.equal(result?.maskedDestination, "ga****@upi");
});

test("UPI is normalized to lowercase", () => {
  const result = validatePayoutDestinationInput({ type: "UPI", displayName: "UPI", upiId: "Player.Name@Example" });
  assert.equal(result?.data.type, "UPI");
  assert.equal(result?.data.type === "UPI" ? result.data.upiId : "", "player.name@example");
});

test("UPI whitespace is trimmed", () => {
  const result = validatePayoutDestinationInput(validUpi("  player@upi  "));
  assert.equal(result?.data.type === "UPI" ? result.data.upiId : "", "player@upi");
});

test("invalid UPI without separator is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validUpi("playerexample")), null);
});

test("invalid UPI with empty local part is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validUpi("@upi")), null);
});

test("invalid UPI with control character is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "UPI", displayName: "UPI\n", upiId: "player@upi" }), null);
});

test("invalid UPI with missing domain is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validUpi("player@")), null);
});

test("invalid UPI with invalid domain characters is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validUpi("player@upi!")), null);
});

test("UPI mask does not expose the full local part", () => {
  const result = validatePayoutDestinationInput(validUpi("secretuser@upi"));
  assert.equal(result?.maskedDestination, "se****@upi");
});

test("valid bank account is normalized and masked", () => {
  const result = validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Main Bank", accountHolderName: "Gajendra Singh", accountNumber: "1234 5678-9012", ifsc: "abcd0123456", bankName: "Example Bank" });
  assert.equal(result?.data.type, "BANK_ACCOUNT");
  assert.equal(result?.maskedDestination, "••••••••9012");
});

test("bank account separators are removed", () => {
  const result = validatePayoutDestinationInput(validBank({ accountNumber: "12-34 567890" }));
  assert.equal(result?.data.type === "BANK_ACCOUNT" ? result.data.accountNumber : "", "1234567890");
});

test("IFSC is normalized to uppercase", () => {
  const result = validatePayoutDestinationInput(validBank({ ifsc: "abcd0123456" }));
  assert.equal(result?.data.type === "BANK_ACCOUNT" ? result.data.ifsc : "", "ABCD0123456");
});

test("bank account with 9 digits is accepted", () => {
  assert.notEqual(validatePayoutDestinationInput(validBank({ accountNumber: "123456789" })), null);
});

test("bank account with 18 digits is accepted", () => {
  assert.notEqual(validatePayoutDestinationInput(validBank({ accountNumber: "123456789012345678" })), null);
});

test("bank account with 19 digits is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validBank({ accountNumber: "1234567890123456789" })), null);
});

test("invalid IFSC is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validBank({ ifsc: "BADIFSC" })), null);
});

test("IFSC with invalid first four letters is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validBank({ ifsc: "ABC01234567" })), null);
});

test("invalid short account number is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validBank({ accountNumber: "12345" })), null);
});

test("invalid nonnumeric account number is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validBank({ accountNumber: "12345ABC90" })), null);
});

test("invalid account holder name is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validBank({ accountHolderName: "12345" })), null);
});

test("blank bank name is rejected", () => {
  assert.equal(validatePayoutDestinationInput(validBank({ bankName: "" })), null);
});

test("blank display name is rejected", () => {
  const validResult = validatePayoutDestinationInput(validUpi());
  assert.ok(validResult);
  assert.equal(validResult.displayName, "UPI");
  assert.equal(validatePayoutDestinationInput({ type: "UPI", displayName: "", upiId: "player@upi" }), null);
});

test("display name is trimmed", () => {
  const result = validatePayoutDestinationInput({ type: "UPI", displayName: "  Primary  ", upiId: "player@upi" });
  assert.equal(result?.displayName, "Primary");
});

test("display name over 100 characters is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "UPI", displayName: "a".repeat(101), upiId: "player@upi" }), null);
});

test("bank account holder name is trimmed", () => {
  const result = validatePayoutDestinationInput(validBank({ accountHolderName: "  Gajendra Singh  " }));
  assert.equal(result?.data.type === "BANK_ACCOUNT" ? result.data.accountHolderName : "", "Gajendra Singh");
});

test("bank name is trimmed", () => {
  const result = validatePayoutDestinationInput(validBank({ bankName: "  Example Bank  " }));
  assert.equal(result?.data.type === "BANK_ACCOUNT" ? result.data.bankName : "", "Example Bank");
});

test("control characters in bank name are rejected", () => {
  assert.equal(validatePayoutDestinationInput(validBank({ bankName: "Bank\nName" })), null);
});

test("destination plaintext is not included in masked value", () => {
  const result = validatePayoutDestinationInput(validUpi("secretuser@upi"));
  assert.equal(result?.maskedDestination.includes("secretuser"), false);
});

test("bank account mask exposes only final four digits", () => {
  const result = validatePayoutDestinationInput(validBank({ accountNumber: "1234567890123456" }));
  assert.equal(result?.maskedDestination, "••••••••3456");
});
