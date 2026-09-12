import { compareMoney, normalizeMoney, WALLET_CURRENCY } from "@/lib/wallet-rules";

export const DEPOSIT_CURRENCY = WALLET_CURRENCY;
export const DEPOSIT_MIN_AMOUNT = "1.00";
export const DEPOSIT_MAX_AMOUNT = "999999999999999999.99";
export const DEPOSIT_PAGE_SIZE = 20;
export const DEPOSIT_PRESETS = ["100.00", "250.00", "500.00", "1000.00", "2000.00", "5000.00"] as const;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function validateDepositAmount(value: string) {
  const normalized = normalizeMoney(value);
  if (!normalized) return { ok: false as const, code: "INVALID_AMOUNT", message: "Enter a valid amount with at most 2 decimal places." };
  if (compareMoney(normalized, DEPOSIT_MIN_AMOUNT) < 0) return { ok: false as const, code: "AMOUNT_TOO_LOW", message: `Minimum deposit is ₹${DEPOSIT_MIN_AMOUNT}.` };
  if (compareMoney(normalized, DEPOSIT_MAX_AMOUNT) > 0) return { ok: false as const, code: "AMOUNT_TOO_HIGH", message: "The deposit amount is above the supported maximum." };
  return { ok: true as const, amount: normalized };
}

export function validateDepositCurrency(value: string) {
  return value.trim().toUpperCase() === DEPOSIT_CURRENCY;
}

export function validateDepositIdempotencyKey(value: string) {
  const key = value.trim();
  if (!IDEMPOTENCY_PATTERN.test(key)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  return key;
}

export function formatDepositStatus(status: string) {
  if (status === "PENDING") return "Payment verification is in progress.";
  if (status === "SUCCESS") return "Money has been added to your wallet.";
  if (status === "FAILED") return "Payment was not completed.";
  if (status === "CANCELLED") return "This deposit was cancelled before payment completed.";
  return "Deposit status is unavailable.";
}
