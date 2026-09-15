/**
 * Do not throw during Next.js startup when an optional provider/payment
 * environment variable is missing. A startup throw takes down every route
 * (including the homepage and health endpoint) and Netlify reports only a
 * generic "Internal Server Error".
 *
 * Production-sensitive routes validate their required configuration when
 * they are actually used via assertProductionEnvironment().
 */
import { validateServerEnvironment } from "@/lib/env";

export function register() {
  if (process.env.APP_ENVIRONMENT !== "production") return;

  try {
    validateServerEnvironment({ requireProduction: true });
  } catch (error) {
    // Keep the application process alive so non-financial/public routes can
    // still render and expose the configuration problem through server logs.
    console.error("Production environment validation failed:", error);
  }
}
