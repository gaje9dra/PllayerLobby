import { createHash } from "node:crypto";

/**
 * Stable support-facing registration reference derived from the immutable
 * registration UUID. It does not expose the database UUID itself.
 */
export function getRegistrationReference(registrationId: string) {
  const digest = createHash("sha256").update(registrationId, "utf8").digest("hex").slice(0, 16).toUpperCase();
  return `PL-REG-${digest}`;
}
