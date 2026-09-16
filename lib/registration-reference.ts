const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Stable support-facing registration reference. The UUID is encoded rather
 * than rendered directly, keeping the raw database identifier out of UI text.
 */
export function getRegistrationReference(registrationId: string) {
  if (!UUID_PATTERN.test(registrationId)) throw new Error("Invalid registration ID.");
  const compact = registrationId.replaceAll("-", "");
  return `PL-REG-${Buffer.from(compact, "hex").toString("base64url")}`;
}

/** Resolve an exact support reference back to its registration UUID for admin search. */
export function registrationIdFromReference(reference: string) {
  const normalized = reference.trim();
  if (!/^PL-REG-[A-Za-z0-9_-]{22}$/.test(normalized)) return null;
  try {
    const compact = Buffer.from(normalized.slice("PL-REG-".length), "base64url").toString("hex");
    if (compact.length !== 32) return null;
    const uuid = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
    return UUID_PATTERN.test(uuid) ? uuid : null;
  } catch {
    return null;
  }
}
