import assert from "node:assert/strict";
import test from "node:test";
import { PayoutStatus } from "@/app/generated/prisma/client";
import { assertPayoutTransition, canTransitionPayout, isFinalPayoutStatus } from "@/lib/payout-state";

test("payout state machine allows the authoritative success path", () => {
  assert.equal(canTransitionPayout(PayoutStatus.PAYOUT_INITIATED, PayoutStatus.PROCESSING), true);
  assert.equal(canTransitionPayout(PayoutStatus.PROCESSING, PayoutStatus.PAID), true);
});

test("payout state machine allows definitive failure", () => {
  assert.equal(canTransitionPayout(PayoutStatus.PAYOUT_INITIATED, PayoutStatus.FAILED), true);
  assert.equal(canTransitionPayout(PayoutStatus.PROCESSING, PayoutStatus.FAILED), true);
});

test("payout state machine allows reversal only after paid", () => {
  assert.equal(canTransitionPayout(PayoutStatus.PAID, PayoutStatus.REVERSED), true);
  assert.equal(canTransitionPayout(PayoutStatus.PROCESSING, PayoutStatus.REVERSED), false);
});

test("invalid payout transitions are rejected", () => {
  assert.throws(() => assertPayoutTransition(PayoutStatus.FAILED, PayoutStatus.PROCESSING), /INVALID_PAYOUT_STATE_TRANSITION/);
  assert.throws(() => assertPayoutTransition(PayoutStatus.PAID, PayoutStatus.PROCESSING), /INVALID_PAYOUT_STATE_TRANSITION/);
});

test("final payout states are immutable except for paid to reversed", () => {
  assert.equal(isFinalPayoutStatus(PayoutStatus.PAID), true);
  assert.equal(isFinalPayoutStatus(PayoutStatus.FAILED), true);
  assert.equal(isFinalPayoutStatus(PayoutStatus.REVERSED), true);
});
