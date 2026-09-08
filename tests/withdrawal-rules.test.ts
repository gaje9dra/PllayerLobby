import test from "node:test";
import assert from "node:assert/strict";
import { compareMoney, normalizeMoney } from "@/lib/wallet-rules";
import { MAX_WITHDRAWAL_AMOUNT, MIN_WITHDRAWAL_AMOUNT, evaluateWithdrawalAmount, getAvailableWithdrawalBalance } from "@/lib/withdrawal-rules";

test("withdrawal minimum is centralized and valid", () => {
  assert.equal(normalizeMoney(MIN_WITHDRAWAL_AMOUNT), MIN_WITHDRAWAL_AMOUNT);
  assert.equal(MAX_WITHDRAWAL_AMOUNT, null);
});

test("available withdrawal balance subtracts reserved requests exactly", () => {
  assert.equal(getAvailableWithdrawalBalance("10000.00", "7000.00"), "3000.00");
  assert.equal(getAvailableWithdrawalBalance("10.10", "0.10"), "10.00");
});

test("withdrawal amount validation uses exact money comparisons", () => {
  assert.equal(evaluateWithdrawalAmount("0.00", "100.00").eligible, false);
  assert.equal(evaluateWithdrawalAmount("0.99", "100.00").reason, "AMOUNT_TOO_LOW");
  assert.equal(evaluateWithdrawalAmount("100.00", "99.99").reason, "INSUFFICIENT_AVAILABLE_BALANCE");
  assert.equal(evaluateWithdrawalAmount("99.99", "100.00").eligible, true);
  assert.equal(compareMoney("1.00", "1.00"), 0);
});
