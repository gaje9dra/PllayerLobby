import "server-only";

export type AppEnvironment = "development" | "test" | "staging" | "production";

const REQUIRED_SERVER_VARS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "PAYU_MERCHANT_KEY",
  "PAYU_MERCHANT_SALT",
  "PAYOUT_ENCRYPTION_KEY",
  "PAYU_PAYOUT_MERCHANT_ID",
  "PAYU_PAYOUT_CLIENT_ID",
  "PAYU_PAYOUT_CLIENT_SECRET",
  "PAYU_PAYOUT_WEBHOOK_SECRET",
] as const;

function value(name: string) {
  return process.env[name]?.trim() || "";
}

export function getAppEnvironment(): AppEnvironment {
  const raw = value("APP_ENVIRONMENT").toLowerCase();
  if (raw === "staging" || raw === "test" || raw === "production" || raw === "development") return raw;
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

export function validateServerEnvironment(options: { requireProduction?: boolean } = {}) {
  const environment = getAppEnvironment();
  const production = options.requireProduction || environment === "production";
  const missing = REQUIRED_SERVER_VARS.filter((name) => !value(name));
  const errors: string[] = missing.map((name) => `${name} is missing.`);

  if (!value("NEXT_PUBLIC_APP_URL")) errors.push("NEXT_PUBLIC_APP_URL is missing.");
  if (!value("APP_TIMEZONE")) errors.push("APP_TIMEZONE is missing.");

  const payuEnvironment = value("PAYU_ENVIRONMENT").toLowerCase();
  const payoutEnvironment = value("PAYU_PAYOUT_ENVIRONMENT").toUpperCase();
  if (!payuEnvironment || !["test", "production"].includes(payuEnvironment)) errors.push("PAYU_ENVIRONMENT must be test or production.");
  if (!payoutEnvironment || !["TEST", "PRODUCTION"].includes(payoutEnvironment)) errors.push("PAYU_PAYOUT_ENVIRONMENT must be TEST or PRODUCTION.");

  if (production) {
    if (payuEnvironment !== "production") errors.push("Production requires PAYU_ENVIRONMENT=production.");
    if (payoutEnvironment !== "PRODUCTION") errors.push("Production requires PAYU_PAYOUT_ENVIRONMENT=PRODUCTION.");
    if (value("PAYU_PAYOUT_PRODUCTION_ENABLED") !== "true") errors.push("Production requires PAYU_PAYOUT_PRODUCTION_ENABLED=true.");
    if (value("PAYOUTS_ENABLED") !== "true") errors.push("Production requires PAYOUTS_ENABLED=true.");
    if (value("NEXT_PUBLIC_APP_URL").startsWith("http://")) errors.push("Production NEXT_PUBLIC_APP_URL must use HTTPS.");
    if (value("NEXT_PUBLIC_APP_URL").includes("localhost")) errors.push("Production NEXT_PUBLIC_APP_URL must not use localhost.");
    if (value("APP_ENVIRONMENT") !== "production") errors.push("Production must explicitly set APP_ENVIRONMENT=production.");
  } else {
    if (payuEnvironment === "production") errors.push("Non-production environments must not use PAYU_ENVIRONMENT=production.");
    if (payoutEnvironment === "PRODUCTION") errors.push("Non-production environments must not use PAYU_PAYOUT_ENVIRONMENT=PRODUCTION.");
  }

  if (errors.length) throw new Error(`Environment configuration invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  return { environment, production, errors: [] as string[] };
}

export function assertProductionEnvironment() {
  return validateServerEnvironment({ requireProduction: true });
}

export function getPayoutsEnabled() {
  const configured = value("PAYOUTS_ENABLED");
  if (getAppEnvironment() === "production") return configured === "true";
  return configured !== "false";
}

export function assertPayoutsEnabled() {
  if (!getPayoutsEnabled()) throw new Error("PAYOUTS_DISABLED");
}
