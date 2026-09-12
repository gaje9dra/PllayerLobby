export type PayUVerificationState = "SUCCESS" | "FAILED" | "PENDING" | "UNKNOWN";

export function mapPayUStatus(status: string, unmappedStatus: string): PayUVerificationState {
  if (status === "success" && (unmappedStatus === "captured" || unmappedStatus === "auth")) return "SUCCESS";
  if (unmappedStatus === "failed" || unmappedStatus === "bounced" || unmappedStatus === "dropped" || unmappedStatus === "usercancelled" || unmappedStatus === "autorefund" || status === "failure" || status === "failed") return "FAILED";
  if (unmappedStatus === "pending" || unmappedStatus === "initiated" || unmappedStatus === "in progress" || status === "pending") return "PENDING";
  return "UNKNOWN";
}

export function normalizePaymentAmount(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const canonicalWhole = whole.replace(/^0+(?=\d)/, "");
  return `${canonicalWhole}.${fraction.padEnd(2, "0")}`;
}
