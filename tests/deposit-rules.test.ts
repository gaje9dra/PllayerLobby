import test from "node:test";
import assert from "node:assert/strict";
import { DEPOSIT_MAX_AMOUNT, DEPOSIT_MIN_AMOUNT, DEPOSIT_PRESETS, validateDepositAmount, validateDepositCurrency, validateDepositIdempotencyKey } from "@/lib/deposit-rules";

test("deposit amount validation rejects zero, negative, malformed, and excessive precision", () => {
  assert.equal(validateDepositAmount("0").ok, false);
  assert.equal(validateDepositAmount("-100").ok, false);
  assert.equal(validateDepositAmount("").ok, false);
  assert.equal(validateDepositAmount("1.234").ok, false);
  assert.equal(validateDepositAmount("abc").ok, false);
  assert.equal(validateDepositAmount(DEPOSIT_MIN_AMOUNT).ok, true);
  assert.equal(validateDepositAmount(DEPOSIT_MAX_AMOUNT).ok, true);
});

test("deposit amount validation rejects values above the storage-safe ceiling", () => {
  assert.equal(validateDepositAmount("1000000000000000000.00").ok, false);
});

test("deposit currency is server-constrained to INR", () => {
  assert.equal(validateDepositCurrency("INR"), true);
  assert.equal(validateDepositCurrency("inr"), true);
  assert.equal(validateDepositCurrency("USD"), false);
});

test("deposit idempotency keys require a safe bounded format", () => {
  assert.doesNotThrow(() => validateDepositIdempotencyKey("deposit-1234567890abcdef"));
  assert.throws(() => validateDepositIdempotencyKey("short"), /INVALID_IDEMPOTENCY_KEY/);
  assert.throws(() => validateDepositIdempotencyKey("deposit key with spaces"), /INVALID_IDEMPOTENCY_KEY/);
});

test("deposit presets remain positive and precise", () => {
  assert.deepEqual(DEPOSIT_PRESETS, ["100.00", "250.00", "500.00", "1000.00", "2000.00", "5000.00"]);
  for (const preset of DEPOSIT_PRESETS) assert.equal(validateDepositAmount(preset).ok, true);
});
