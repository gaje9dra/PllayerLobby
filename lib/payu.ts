import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const TEST_CHECKOUT_URL = "https://test.payu.in/_payment";
const PRODUCTION_CHECKOUT_URL = "https://secure.payu.in/_payment";

export type PayUEnvironment = "test" | "production";

export type PayURequestFields = {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  surl: string;
  furl: string;
  hash: string;
};

export type PayUResponseFields = {
  key?: string;
  txnid?: string;
  amount?: string;
  productinfo?: string;
  firstname?: string;
  email?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  status?: string;
  hash?: string;
  mihpayid?: string;
};

function sha512(value: string) {
  return createHash("sha512").update(value, "utf8").digest("hex");
}

function requiredEnv(name: "PAYU_MERCHANT_KEY" | "PAYU_MERCHANT_SALT" | "PAYU_ENVIRONMENT") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required PayU environment variable: ${name}`);
  }
  return value;
}

export function getPayUEnvironment(): PayUEnvironment {
  const value = requiredEnv("PAYU_ENVIRONMENT").toLowerCase();
  if (value !== "test" && value !== "production") {
    throw new Error("PAYU_ENVIRONMENT must be either test or production.");
  }
  return value;
}

export function getPayUCheckoutUrl() {
  return getPayUEnvironment() === "production" ? PRODUCTION_CHECKOUT_URL : TEST_CHECKOUT_URL;
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

export function validatePayUResponseHash(input: PayUResponseFields, salt: string) {
  if (!input.key || !input.txnid || !input.amount || !input.productinfo || !input.firstname || !input.email || !input.status || !input.hash) {
    return false;
  }

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

  if (!/^[a-f0-9]{128}$/.test(provided)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
}

export function getPayUConfig() {
  const merchantKey = requiredEnv("PAYU_MERCHANT_KEY");
  const merchantSalt = requiredEnv("PAYU_MERCHANT_SALT");
  const environment = getPayUEnvironment();

  return {
    merchantKey,
    merchantSalt,
    environment,
    checkoutUrl: environment === "production" ? PRODUCTION_CHECKOUT_URL : TEST_CHECKOUT_URL,
  };
}
