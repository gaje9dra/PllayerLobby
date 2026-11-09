import assert from "node:assert/strict";
import test from "node:test";
import { validateManualPaymentReference } from "@/lib/manual-withdrawal-rules";

test("manual payout reference trims surrounding whitespace", () => {
  assert.equal(validateManualPaymentReference("  UTR-123456789  "), "UTR-123456789");
});

test("manual payout reference accepts common bank and UPI reference characters", () => {
  assert.equal(validateManualPaymentReference("1234/ABC-98_XY:77"), "1234/ABC-98_XY:77");
});

test("manual payout reference rejects missing, short, and overlong values", () => {
  assert.throws(() => validateManualPaymentReference("   "), /INVALID_MANUAL_PAYMENT_REFERENCE/);
  assert.throws(() => validateManualPaymentReference("abc"), /INVALID_MANUAL_PAYMENT_REFERENCE/);
  assert.throws(() => validateManualPaymentReference("A".repeat(129)), /INVALID_MANUAL_PAYMENT_REFERENCE/);
});

test("manual payout reference rejects unsafe characters", () => {
  assert.throws(() => validateManualPaymentReference("UTR-123<script>"), /INVALID_MANUAL_PAYMENT_REFERENCE/);
  assert.throws(() => validateManualPaymentReference("UTR\n1234"), /INVALID_MANUAL_PAYMENT_REFERENCE/);
});
