import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PaymentStatus } from "@/app/generated/prisma/client";
import { generatePayURequestHash, getPayUConfig, validatePayUResponseHash } from "@/lib/payu";
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
    .update(`${requestInput.key}|${requestInput.txnid}|${requestInput.amount}|${requestInput.productinfo}|${requestInput.firstname}|${requestInput.email}||||||||||||${requestInput.salt}`, "utf8")
    .digest("hex");

  assert.equal(generatePayURequestHash(requestInput), expected);
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

test("PayU configuration requires all server-only environment variables", () => {
  const previous = {
    key: process.env.PAYU_MERCHANT_KEY,
    salt: process.env.PAYU_MERCHANT_SALT,
    environment: process.env.PAYU_ENVIRONMENT,
  };

  delete process.env.PAYU_MERCHANT_KEY;
  delete process.env.PAYU_MERCHANT_SALT;
  delete process.env.PAYU_ENVIRONMENT;

  assert.throws(() => getPayUConfig(), /PAYU_MERCHANT_KEY/);

  if (previous.key === undefined) delete process.env.PAYU_MERCHANT_KEY;
  else process.env.PAYU_MERCHANT_KEY = previous.key;
  if (previous.salt === undefined) delete process.env.PAYU_MERCHANT_SALT;
  else process.env.PAYU_MERCHANT_SALT = previous.salt;
  if (previous.environment === undefined) delete process.env.PAYU_ENVIRONMENT;
  else process.env.PAYU_ENVIRONMENT = previous.environment;
});
