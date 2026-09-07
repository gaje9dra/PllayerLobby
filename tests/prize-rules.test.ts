import test from "node:test";
import assert from "node:assert/strict";
import {
  addMoney,
  canFinalizePrizeAllocation,
  compareMoney,
  isPositivePrizeAmount,
  normalizePrizeAmount,
  parsePrizeRank,
} from "@/lib/prize-rules";

test("prize ranks are positive integers", () => {
  assert.equal(parsePrizeRank("1"), 1);
  assert.equal(parsePrizeRank("5"), 5);
  assert.equal(parsePrizeRank("0"), null);
  assert.equal(parsePrizeRank("-1"), null);
  assert.equal(parsePrizeRank("1.5"), null);
});

test("prize amounts preserve exact two-decimal money precision", () => {
  assert.equal(normalizePrizeAmount("1000"), "1000.00");
  assert.equal(normalizePrizeAmount("1000.1"), "1000.10");
  assert.equal(normalizePrizeAmount("1000.10"), "1000.10");
  assert.equal(normalizePrizeAmount("1000.123"), null);
  assert.equal(normalizePrizeAmount("-1"), null);
  assert.equal(normalizePrizeAmount("NaN"), null);
  assert.equal(normalizePrizeAmount("Infinity"), null);
});

test("money arithmetic does not use floating point", () => {
  assert.equal(addMoney(["0.10", "0.20", "1000.10"]), "1000.40");
  assert.equal(compareMoney("1000.40", "1000.4"), 0);
});

test("normal prize positions must be positive", () => {
  assert.equal(isPositivePrizeAmount("0.01"), true);
  assert.equal(isPositivePrizeAmount("0.00"), false);
});

test("finalization requires allocation to equal prize pool", () => {
  assert.equal(canFinalizePrizeAllocation("10000.00", "10000.00"), true);
  assert.equal(canFinalizePrizeAllocation("9000.00", "10000.00"), false);
  assert.equal(canFinalizePrizeAllocation("12000.00", "10000.00"), false);
});
