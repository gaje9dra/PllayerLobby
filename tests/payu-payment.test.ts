import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PaymentStatus } from "@/app/generated/prisma/client";
import { generatePayURequestHash, validatePayUResponseHash } from "@/lib/payu";
import { generateMerchantTransactionId } from "@/lib/payment";
import { canTransitionPaymentStatus } from "@/lib/payment-workflow-rules";

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

test("PayU request hash uses the documented hosted checkout ordering", () => {
  const hash = generatePayURequestHash(requestInput);
  assert.match(hash, /^[a-f0-9]{128}$/);
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
});
