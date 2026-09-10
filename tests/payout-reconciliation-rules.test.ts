import assert from "node:assert/strict";
import test from "node:test";
import { interpretPayUTransferStatus } from "@/lib/payout-provider-rules";

test("PayU success is accepted only with matching amount and currency", () => {
  const result = interpretPayUTransferStatus({ data: { transactionDetails: [{ merchantRefId: "PL123", amount: 100, txnStatus: "SUCCESS", payuTransactionRefNo: "PAYU1", bankTransactionRefNo: "BANK1" }] } }, "PL123", "100.00", "INR");
  assert.deepEqual(result, { state: "SUCCESS", providerReference: "PAYU1", bankReference: "BANK1" });
});

test("PayU amount mismatch becomes a reconciliation mismatch", () => {
  const result = interpretPayUTransferStatus({ data: { transactionDetails: [{ merchantRefId: "PL123", amount: 99, txnStatus: "SUCCESS" }] } }, "PL123", "100.00", "INR");
  assert.deepEqual(result, { state: "MISMATCH" });
});

test("missing PayU transaction remains unresolved", () => {
  const result = interpretPayUTransferStatus({ data: { transactionDetails: [] } }, "PL123", "100.00", "INR");
  assert.deepEqual(result, { state: "UNKNOWN" });
});

test("PayU pending-like statuses remain processing", () => {
  const result = interpretPayUTransferStatus({ data: { transactionDetails: [{ merchantRefId: "PL123", amount: 100, txnStatus: "PENDING", payuTransactionRefNo: "PAYU1" }] } }, "PL123", "100.00", "INR");
  assert.deepEqual(result, { state: "PROCESSING", providerReference: "PAYU1" });
});

test("PayU definitive failure is represented as failure", () => {
  const result = interpretPayUTransferStatus({ data: { transactionDetails: [{ merchantRefId: "PL123", amount: 100, txnStatus: "FAILED", msg: "technical decline" }] } }, "PL123", "100.00", "INR");
  assert.deepEqual(result, { state: "FAILED", providerReference: "", message: "technical decline" });
});
