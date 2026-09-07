import "server-only";

export {
  generatePayURequestHash,
  generatePayUVerifyPaymentHash,
  validatePayUResponseHash,
  type PayUResponseFields,
} from "@/lib/payu-hash";

const TEST_CHECKOUT_URL = "https://test.payu.in/_payment";
const PRODUCTION_CHECKOUT_URL = "https://secure.payu.in/_payment";
const TEST_VERIFY_PAYMENT_URL = "https://test.payu.in/merchant/postservice?form=2";
const PRODUCTION_VERIFY_PAYMENT_URL = "https://info.payu.in/merchant/postservice.php?form=2";

export type PayUEnvironment = "test" | "production";

export type PayURequestFields = {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  surl: string;
  furl: string;
  hash: string;
};

function requiredEnv(name: "PAYU_MERCHANT_KEY" | "PAYU_MERCHANT_SALT" | "PAYU_ENVIRONMENT") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required PayU environment variable: ${name}`);
  return value;
}

export function getPayUEnvironment(): PayUEnvironment {
  const value = requiredEnv("PAYU_ENVIRONMENT").toLowerCase();
  if (value !== "test" && value !== "production") throw new Error("PAYU_ENVIRONMENT must be either test or production.");
  return value;
}

export function getPayUCheckoutUrl() {
  return getPayUEnvironment() === "production" ? PRODUCTION_CHECKOUT_URL : TEST_CHECKOUT_URL;
}

export function getPayUVerifyPaymentUrl() {
  return getPayUEnvironment() === "production" ? PRODUCTION_VERIFY_PAYMENT_URL : TEST_VERIFY_PAYMENT_URL;
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
    verifyPaymentUrl: environment === "production" ? PRODUCTION_VERIFY_PAYMENT_URL : TEST_VERIFY_PAYMENT_URL,
  };
}
