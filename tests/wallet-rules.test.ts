import test from "node:test";
import assert from "node:assert/strict";
import { addMoney, compareMoney, isPositiveMoney, isSupportedCurrency, normalizeMoney, subtractMoney, isValidReferenceType } from "@/lib/wallet-rules";

test("wallet money uses exact two-decimal arithmetic", () => {
  assert.equal(normalizeMoney("0.1"), "0.10");
  assert.equal(addMoney("0.10", "0.20"), "0.30");
  assert.equal(subtractMoney("1.00", "0.30"), "0.70");
  assert.equal(compareMoney("500.00", "500.00"), 0);
});

test("invalid and non-positive money is rejected", () => {
  assert.equal(normalizeMoney("-1.00"), null);
  assert.equal(normalizeMoney("1.234"), null);
  assert.equal(normalizeMoney("NaN"), null);
  assert.equal(isPositiveMoney("0.00"), false);
  assert.equal(isPositiveMoney("0.10"), true);
});

test("wallet currency and references are constrained", () => {
  assert.equal(isSupportedCurrency("INR"), true);
  assert.equal(isSupportedCurrency("USD"), false);
  assert.equal(isValidReferenceType("PRIZE_SETTLEMENT"), true);
  assert.equal(isValidReferenceType("ARBITRARY"), false);
});

test("debit arithmetic cannot cross below zero", () => {
  assert.throws(() => subtractMoney("100.00", "100.01"), /negative/);
});
