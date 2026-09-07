export type PayUVerificationState = "SUCCESS" | "FAILED" | "PENDING" | "UNKNOWN";

export function mapPayUStatus(status: string, unmappedStatus: string): PayUVerificationState {
  if (status === "success" && (unmappedStatus === "captured" || unmappedStatus === "auth")) return "SUCCESS";
  if (unmappedStatus === "failed" || unmappedStatus === "bounced" || unmappedStatus === "dropped" || unmappedStatus === "usercancelled" || unmappedStatus === "autorefund" || status === "failure" || status === "failed") return "FAILED";
  if (unmappedStatus === "pending" || unmappedStatus === "initiated" || unmappedStatus === "in progress" || status === "pending") return "PENDING";
  return "UNKNOWN";
}

export function normalizePaymentAmount(value: string | null | undefined) {
  if (value == null || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number.toFixed(2) : null;
}
