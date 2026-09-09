export const PAYU_PAYMENT_TYPES = ["UPI", "IMPS", "NEFT", "RTGS"] as const;
export type PayUPaymentTypeRule = (typeof PAYU_PAYMENT_TYPES)[number];

export function isPayUPaymentType(value: string): value is PayUPaymentTypeRule {
  return (PAYU_PAYMENT_TYPES as readonly string[]).includes(value);
}

export function resolvePaymentType(destinationType: "UPI" | "BANK_ACCOUNT", requested: string | undefined) {
  const paymentType = (requested || "IMPS").toUpperCase();
  if (!isPayUPaymentType(paymentType)) throw new Error("INVALID_PAYMENT_TYPE");
  if (destinationType === "UPI" && paymentType !== "UPI") throw new Error("UPI_REQUIRES_UPI_PAYMENT_TYPE");
  if (destinationType === "BANK_ACCOUNT" && paymentType === "UPI") throw new Error("BANK_DESTINATION_REQUIRES_BANK_PAYMENT_TYPE");
  return paymentType;
}

export function mapPayUTransferStatus(status: string) {
  switch (status.toUpperCase()) {
    case "SUCCESS": return "SUCCESS" as const;
    case "FAILED": return "FAILED" as const;
    case "IN_PROGRESS":
    case "PENDING":
    case "QUEUED":
    case "WAITING_FOR_RETRY": return "PROCESSING" as const;
    default: return "UNKNOWN" as const;
  }
}

export function canRetryPayUStatus(status: string) {
  return status.toUpperCase() === "FAILED";
}

export function isMerchantReferenceValid(value: string) {
  return /^[A-Za-z0-9._-]{1,40}$/.test(value);
}

export function buildPayUTransferPayload(input: { destinationType: "UPI" | "BANK_ACCOUNT"; paymentType: PayUPaymentTypeRule; beneficiaryName: string; beneficiaryEmail?: string; beneficiaryMobile?: string; accountNumber?: string; ifsc?: string; vpa?: string; amount: string; batchId: string; merchantRefId: string }) {
  if (!isMerchantReferenceValid(input.merchantRefId)) throw new Error("INVALID_MERCHANT_REFERENCE");
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(input.amount) || Number(input.amount) <= 0) throw new Error("INVALID_PAYOUT_AMOUNT");
  if (input.destinationType === "UPI") {
    if (input.paymentType !== "UPI" || !input.vpa) throw new Error("INVALID_UPI_TRANSFER");
    return { beneficiaryName: input.beneficiaryName, beneficiaryEmail: input.beneficiaryEmail, beneficiaryMobile: input.beneficiaryMobile, purpose: "PlayerLobby withdrawal", amount: Number(input.amount), batchId: input.batchId, merchantRefId: input.merchantRefId, paymentType: "UPI" as const, vpa: input.vpa, retry: false };
  }
  if (input.paymentType === "UPI" || !input.accountNumber || !input.ifsc) throw new Error("INVALID_BANK_TRANSFER");
  return { beneficiaryAccountNumber: input.accountNumber, beneficiaryIfscCode: input.ifsc, beneficiaryName: input.beneficiaryName, beneficiaryEmail: input.beneficiaryEmail, beneficiaryMobile: input.beneficiaryMobile, purpose: "PlayerLobby withdrawal", amount: Number(input.amount), batchId: input.batchId, merchantRefId: input.merchantRefId, paymentType: input.paymentType, retry: false };
}
