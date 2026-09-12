import test from "node:test";
import assert from "node:assert/strict";
import { generatePayURequestHash, validatePayUResponseHash } from "@/lib/payu-hash";
import { parsePayUWalletCallback } from "@/lib/payu-wallet-deposit";

const salt = "test-salt";
const fields = {
  key: "test-key",
  txnid: "DEP-ABC123DEF456",
  amount: "500.00",
  productinfo: "PlayerLobby Wallet Deposit - DEP-ABC123DEF456",
  firstname: "Player",
  email: "player@example.test",
  phone: "9876543210",
  udf1: "",
  udf2: "",
  udf3: "",
  udf4: "",
  udf5: "",
};

test("PayU wallet request hash validates with the established SHA-512 scheme", () => {
  const hash = generatePayURequestHash({ ...fields, salt });
  assert.equal(hash.length, 128);
  assert.equal(validatePayUResponseHash({ ...fields, status: "success", hash }, salt), true);
});

test("tampered PayU response hash is rejected", () => {
  const hash = generatePayURequestHash({ ...fields, salt });
  const tampered = `${hash.slice(0, -1)}${hash.endsWith("0") ? "1" : "0"}`;
  assert.equal(validatePayUResponseHash({ ...fields, status: "success", hash: tampered }, salt), false);
});

test("callback parser accepts provider form fields without trusting them", () => {
  const parsed = parsePayUWalletCallback({ ...fields, status: "success", hash: "bad", mihpayid: "12345" });
  assert.equal(parsed.txnid, fields.txnid);
  assert.equal(parsed.amount, fields.amount);
  assert.equal(parsed.status, "success");
  assert.equal(parsed.mihpayid, "12345");
});

test("fake success without a valid provider hash cannot be treated as verified", () => {
  const parsed = parsePayUWalletCallback({ ...fields, status: "success", hash: "fake" });
  assert.equal(validatePayUResponseHash(parsed, salt), false);
});
