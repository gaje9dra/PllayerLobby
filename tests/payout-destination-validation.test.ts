import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePayoutDestinationInput } from "@/lib/payout-destination-validation";

test("normalizes and masks a valid UPI destination", () => {
  const result = validatePayoutDestinationInput({
    type: "UPI",
    displayName: "My UPI",
    upiId: "Gajendra@OKAXIS",
  });

  assert.ok(result);
  assert.equal(result.displayName, "My UPI");
  assert.equal(result.maskedDestination, "ga****@okaxis");
  assert.deepEqual(result.data, {
    version: 1,
    type: "UPI",
    upiId: "gajendra@okaxis",
  });
});

test("rejects a malformed UPI ID", () => {
  assert.equal(validatePayoutDestinationInput({
    type: "UPI",
    displayName: "My UPI",
    upiId: "not-a-valid-upi-id",
  }), null);
});

test("normalizes and masks a valid bank destination", () => {
  const result = validatePayoutDestinationInput({
    type: "BANK_ACCOUNT",
    displayName: "Primary bank",
    accountHolderName: "Gajendra Singh",
    accountNumber: "1234 5678 9012",
    ifsc: "sbin0001234",
    bankName: "State Bank of India",
  });

  assert.ok(result);
  assert.equal(result.maskedDestination, "••••••••9012");
  assert.deepEqual(result.data, {
    version: 1,
    type: "BANK_ACCOUNT",
    accountHolderName: "Gajendra Singh",
    accountNumber: "123456789012",
    ifsc: "SBIN0001234",
    bankName: "State Bank of India",
  });
});

test("rejects a bank account number outside 9–18 digits", () => {
  assert.equal(validatePayoutDestinationInput({
    type: "BANK_ACCOUNT",
    displayName: "Primary bank",
    accountHolderName: "Gajendra Singh",
    accountNumber: "12345678",
    ifsc: "SBIN0001234",
    bankName: "State Bank of India",
  }), null);
});

test("rejects an invalid IFSC code", () => {
  assert.equal(validatePayoutDestinationInput({
    type: "BANK_ACCOUNT",
    displayName: "Primary bank",
    accountHolderName: "Gajendra Singh",
    accountNumber: "123456789",
    ifsc: "SBIN123",
    bankName: "State Bank of India",
  }), null);
});

test("rejects missing display names and control characters", () => {
  assert.equal(validatePayoutDestinationInput({
    type: "UPI",
    displayName: " ",
    upiId: "gajendra@okaxis",
  }), null);

  assert.equal(validatePayoutDestinationInput({
    type: "UPI",
    displayName: "My\nUPI",
    upiId: "gajendra@okaxis",
  }), null);
});
