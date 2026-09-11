import "dotenv/config";
import { validateServerEnvironment } from "../lib/env-core";

try {
  const result = validateServerEnvironment({ requireProduction: process.argv.includes("--production") });
  console.log(`ENVIRONMENT: ${result.environment.toUpperCase()}`);
  console.log("DATABASE CONFIG: OK");
  console.log("GOOGLE OAUTH: OK");
  console.log("PAYU PAYMENT CONFIG: OK");
  console.log("PAYU PAYOUT CONFIG: OK");
  console.log("PAYOUT ENCRYPTION: OK");
  console.log("CONFIGURATION: OK");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Environment configuration invalid.");
  process.exitCode = 1;
}
