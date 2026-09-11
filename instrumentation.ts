import { validateServerEnvironment } from "@/lib/env";

export function register() {
  if (process.env.NODE_ENV === "production") {
    validateServerEnvironment({ requireProduction: true });
  }
}
