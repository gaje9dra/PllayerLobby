import { validateServerEnvironment } from "@/lib/env";

export function register() {
  if (process.env.APP_ENVIRONMENT === "production") {
    validateServerEnvironment({ requireProduction: true });
  }
}
