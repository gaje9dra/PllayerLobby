export const PAYU_PAYMENT_TYPES = ["UPI", "IMPS", "NEFT", "RTGS"] as const;
export type PayUPaymentTypeRule = (typeof PAYU_PAYMENT_TYPES)[number];
export const PAYU_FINAL_STATUSES = ["PAID", "FAILED", "REVERSED"] as const;
export const PAYU_ACTIVE_STATUSES = ["PAYOUT_INITIATED", "PROCESSING"] as const;
export const PAYU_WEBHOOK_EVENTS = ["TRANSFER_SUCCESS", "TRANSFER_FAILED", "TRANSFER_REVERSED", "REQUEST_PROCESSING_FAILED"] as const;

export function isValidPayUPaymentType(value: string): value is PayUPaymentTypeRule { return PAYU_PAYMENT_TYPES.includes(value as PayUPaymentTypeRule); }
export function isPaymentTypeAllowed(destinationType: "UPI" | "BANK_ACCOUNT", paymentType: string) { return isValidPayUPaymentType(paymentType) && (destinationType === "UPI" ? paymentType === "UPI" : paymentType !== "UPI"); }
export function isValidMerchantReference(value: string) { return /^[A-Za-z0-9_-]{1,40}$/.test(value); }
export function canRetryPayUPayout(status: string) { return status === "FAILED"; }
export function isActivePayUPayout(status: string) { return PAYU_ACTIVE_STATUSES.includes(status as (typeof PAYU_ACTIVE_STATUSES)[number]); }
export function isFinalPayUPayout(status: string) { return PAYU_FINAL_STATUSES.includes(status as (typeof PAYU_FINAL_STATUSES)[number]); }
export function isKnownPayUWebhookEvent(event: string) { return PAYU_WEBHOOK_EVENTS.includes(event as (typeof PAYU_WEBHOOK_EVENTS)[number]); }
export function mapsPayUTransferStatus(status: string) { const normalized = status.trim().toUpperCase(); if (normalized === "SUCCESS") return "SUCCESS" as const; if (normalized === "FAILED") return "FAILED" as const; return "PROCESSING" as const; }
export function shouldReleaseReservation(status: string) { return status === "FAILED" || status === "REJECTED" || status === "CANCELLED"; }
export function shouldDebitWallet(status: string) { return status === "PAID"; }
export function isDefinitiveFailure(status: string) { return status === "FAILED"; }
export function isAmbiguousProviderResult(status: string) { return status === "UNKNOWN" || status === "TIMEOUT" || status === "HTTP_5XX" || status === "MALFORMED"; }
