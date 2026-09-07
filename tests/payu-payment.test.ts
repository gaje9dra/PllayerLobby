import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PaymentStatus } from "@/app/generated/prisma/client";
import { generatePayURequestHash, generatePayUVerifyPaymentHash, validatePayUResponseHash } from "@/lib/payu-hash";
import { generateMerchantTransactionId, canTransitionPaymentStatus } from "@/lib/payment-workflow-rules";
import { mapPayUStatus, normalizePaymentAmount } from "@/lib/payu-verification-rules";

const requestInput = {
  key: "merchant-key",
  txnid: "PLabcdef0123456789abcdef",
  amount: "100.00",
  productinfo: "Tournament Entry - Test Cup",
  firstname: "Gajendra",
  email: "[email protected]",
  salt: "merchant-salt",
};

function makeResponseHash(status = "success") {
  const value = [
    requestInput.salt,
    status,
    "",
    "",
    "",
    "",
    "",
    requestInput.email,
    requestInput.firstname,
    requestInput.productinfo,
    requestInput.amount,
    requestInput.txnid,
    requestInput.key,
  ].join("|");
  return createHash("sha512").update(value, "utf8").digest("hex");
}

test("PayU request hash matches the documented hosted checkout formula", () => {
  const expected = createHash("sha512")
    .update(`${requestInput.key}|${requestInput.txnid}|${requestInput.amount}|${requestInput.productinfo}|${requestInput.firstname}|${requestInput.email}|||||||||||${requestInput.salt}`, "utf8")
    .digest("hex");

  assert.equal(generatePayURequestHash(requestInput), expected);
});

test("PayU verify_payment hash matches the documented command API formula", () => {
  const expected = createHash("sha512")
    .update(`${requestInput.key}|verify_payment|${requestInput.txnid}|${requestInput.salt}`, "utf8")
    .digest("hex");

  assert.equal(generatePayUVerifyPaymentHash(requestInput), expected);
});

test("PayU response hash validates a correctly signed response", () => {
  const response = { ...requestInput, status: "success", hash: makeResponseHash() };
  assert.equal(validatePayUResponseHash(response, requestInput.salt), true);
});

test("PayU response hash rejects tampered amounts", () => {
  const response = { ...requestInput, amount: "1.00", status: "success", hash: makeResponseHash() };
  assert.equal(validatePayUResponseHash(response, requestInput.salt), false);
});

test("PayU response hash rejects invalid hash material", () => {
  const response = { ...requestInput, status: "success", hash: "not-a-hash" };
  assert.equal(validatePayUResponseHash(response, requestInput.salt), false);
});

test("PayU verification maps captured success to SUCCESS", () => {
  assert.equal(mapPayUStatus("success", "captured"), "SUCCESS");
});

test("PayU verification maps authorized success to SUCCESS", () => {
  assert.equal(mapPayUStatus("success", "auth"), "SUCCESS");
});

test("PayU verification does not treat an unknown success state as SUCCESS", () => {
  assert.equal(mapPayUStatus("success", "unknown"), "UNKNOWN");
});

test("PayU verification maps failed, cancelled and pending states safely", () => {
  assert.equal(mapPayUStatus("failure", "failed"), "FAILED");
  assert.equal(mapPayUStatus("failure", "usercancelled"), "FAILED");
  assert.equal(mapPayUStatus("pending", "pending"), "PENDING");
  assert.equal(mapPayUStatus("pending", "in progress"), "PENDING");
});

test("payment amount validation rejects malformed and negative values", () => {
  assert.equal(normalizePaymentAmount("100.00"), "100.00");
  assert.equal(normalizePaymentAmount("1"), "1.00");
  assert.equal(normalizePaymentAmount("-1.00"), null);
  assert.equal(normalizePaymentAmount("not-an-amount"), null);
});

test("merchant transaction IDs are unpredictable fixed-length server identifiers", () => {
  const first = generateMerchantTransactionId();
  const second = generateMerchantTransactionId();

  assert.match(first, /^PL[a-f0-9]{22}$/);
  assert.match(second, /^PL[a-f0-9]{22}$/);
  assert.notEqual(first, second);
});

test("payment state machine blocks SUCCESS back to PENDING", () => {
  assert.equal(canTransitionPaymentStatus(PaymentStatus.SUCCESS, PaymentStatus.PENDING), false);
  assert.equal(canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.FAILED), true);
  assert.equal(canTransitionPaymentStatus(PaymentStatus.INITIATED, PaymentStatus.PENDING), true);
  assert.equal(canTransitionPaymentStatus(PaymentStatus.FAILED, PaymentStatus.PENDING), true);
});
