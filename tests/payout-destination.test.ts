import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { decryptPayoutData, encryptPayoutData } = await import("../lib/payout-crypto");
const { validatePayoutDestinationInput } = await import("../lib/payout-destination");

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

test("invalid UPI without separator is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "UPI", displayName: "UPI", upiId: "playerexample" }), null);
});

test("invalid UPI with empty local part is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "UPI", displayName: "UPI", upiId: "@upi" }), null);
});

test("invalid UPI with control character is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "UPI", displayName: "UPI\n", upiId: "player@upi" }), null);
});

test("valid bank account is normalized and masked", () => {
  const result = validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Main Bank", accountHolderName: "Gajendra Singh", accountNumber: "1234 5678-9012", ifsc: "abcd0123456", bankName: "Example Bank" });
  assert.equal(result?.data.type, "BANK_ACCOUNT");
  assert.equal(result?.maskedDestination, "••••••••9012");
});

test("bank account separators are removed", () => {
  const result = validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Bank", accountHolderName: "Gajendra", accountNumber: "12-34 567890", ifsc: "ABCD0123456", bankName: "Bank" });
  assert.equal(result?.data.type === "BANK_ACCOUNT" ? result.data.accountNumber : "", "1234567890");
});

test("IFSC is normalized to uppercase", () => {
  const result = validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Bank", accountHolderName: "Gajendra", accountNumber: "1234567890", ifsc: "abcd0123456", bankName: "Bank" });
  assert.equal(result?.data.type === "BANK_ACCOUNT" ? result.data.ifsc : "", "ABCD0123456");
});

test("invalid IFSC is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Bank", accountHolderName: "Gajendra", accountNumber: "1234567890", ifsc: "BADIFSC", bankName: "Bank" }), null);
});

test("invalid short account number is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Bank", accountHolderName: "Gajendra", accountNumber: "12345", ifsc: "ABCD0123456", bankName: "Bank" }), null);
});

test("invalid nonnumeric account number is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Bank", accountHolderName: "Gajendra", accountNumber: "12345ABC90", ifsc: "ABCD0123456", bankName: "Bank" }), null);
});

test("invalid account holder name is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Bank", accountHolderName: "12345", accountNumber: "1234567890", ifsc: "ABCD0123456", bankName: "Bank" }), null);
});

test("blank bank name is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Bank", accountHolderName: "Gajendra", accountNumber: "1234567890", ifsc: "ABCD0123456", bankName: "" }), null);
});

test("blank display name is rejected", () => {
  assert.equal(validatePayoutDestinationInput({ type: "UPI", displayName: "", upiId: "player@upi" }), null);
});

test("display name is trimmed", () => {
  const result = validatePayoutDestinationInput({ type: "UPI", displayName: "  Primary  ", upiId: "player@upi" });
  assert.equal(result?.displayName, "Primary");
});

test("destination plaintext is not included in masked value", () => {
  const result = validatePayoutDestinationInput({ type: "UPI", displayName: "UPI", upiId: "secretuser@upi" });
  assert.equal(result?.maskedDestination.includes("secretuser"), false);
});

test("bank account mask exposes only final four digits", () => {
  const result = validatePayoutDestinationInput({ type: "BANK_ACCOUNT", displayName: "Bank", accountHolderName: "Gajendra", accountNumber: "1234567890123456", ifsc: "ABCD0123456", bankName: "Bank" });
  assert.equal(result?.maskedDestination, "••••••••3456");
});
