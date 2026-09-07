import { createHash, timingSafeEqual } from "node:crypto";

function sha512(value: string) {
  return createHash("sha512").update(value, "utf8").digest("hex");
}

export function generatePayURequestHash(input: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  salt: string;
}) {
  const hashString = [
    input.key,
    input.txnid,
    input.amount,
    input.productinfo,
    input.firstname,
    input.email,
    input.udf1 ?? "",
    input.udf2 ?? "",
    input.udf3 ?? "",
    input.udf4 ?? "",
    input.udf5 ?? "",
    "",
    "",
    "",
    "",
    "",
    input.salt,
  ].join("|");

  return sha512(hashString);
}

export function generatePayUVerifyPaymentHash(input: { key: string; txnid: string; salt: string }) {
  return sha512([input.key, "verify_payment", input.txnid, input.salt].join("|"));
}

export type PayUResponseFields = {
  key?: string;
  txnid?: string;
  amount?: string;
  productinfo?: string;
  firstname?: string;
  email?: string;
  phone?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  status?: string;
  hash?: string;
  mihpayid?: string;
};

export function validatePayUResponseHash(input: PayUResponseFields, salt: string) {
  if (!input.key || !input.txnid || !input.amount || !input.productinfo || !input.firstname || !input.email || !input.status || !input.hash) return false;

  const reverseHashString = [
    salt,
    input.status,
    "",
    "",
    "",
    "",
    "",
    input.udf5 ?? "",
    input.udf4 ?? "",
    input.udf3 ?? "",
    input.udf2 ?? "",
    input.udf1 ?? "",
    input.email,
    input.firstname,
    input.productinfo,
    input.amount,
    input.txnid,
    input.key,
  ].join("|");

  const expected = sha512(reverseHashString);
  const provided = input.hash.toLowerCase();
  if (!/^[a-f0-9]{128}$/.test(provided)) return false;

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
}
