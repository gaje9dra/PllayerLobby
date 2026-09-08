import { addMoney, compareMoney, isPositiveMoney, isSupportedCurrency, normalizeMoney, subtractMoney, WALLET_CURRENCY } from "@/lib/wallet-rules";

export const MIN_WITHDRAWAL_AMOUNT = "1.00";
export const MAX_WITHDRAWAL_AMOUNT: string | null = null;
export const DAILY_WITHDRAWAL_LIMIT: string | null = null;
export const WITHDRAWAL_PAGE_SIZE = 20;
export const WITHDRAWAL_CURRENCY = WALLET_CURRENCY;

export type WithdrawalEligibilityReason =
  | "USER_NOT_ACTIVE"
  | "WALLET_NOT_FOUND"
  | "AMOUNT_TOO_LOW"
  | "AMOUNT_TOO_HIGH"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_AVAILABLE_BALANCE"
  | "CURRENCY_MISMATCH"
  | "WITHDRAWAL_LIMIT_EXCEEDED"
  | "PENDING_REQUEST_CONFLICT";

export function validateWithdrawalAmount(value: string) {
  const amount = normalizeMoney(value);
  if (!amount || !isPositiveMoney(amount)) return null;
  return amount;
}

export function validateWithdrawalCurrency(currency: string) {
  const value = currency.trim().toUpperCase();
  return isSupportedCurrency(value) && value === WITHDRAWAL_CURRENCY ? value : null;
}

export function getAvailableWithdrawalBalance(balance: string, reserved: string) {
  return subtractMoney(balance, reserved);
}

export function evaluateWithdrawalAmount(amount: string, available: string) {
  const normalized = validateWithdrawalAmount(amount);
  if (!normalized) return { eligible: false as const, reason: "INVALID_AMOUNT" as const };
  if (compareMoney(normalized, MIN_WITHDRAWAL_AMOUNT) < 0) return { eligible: false as const, reason: "AMOUNT_TOO_LOW" as const };
  if (MAX_WITHDRAWAL_AMOUNT && compareMoney(normalized, MAX_WITHDRAWAL_AMOUNT) > 0) return { eligible: false as const, reason: "AMOUNT_TOO_HIGH" as const };
  if (compareMoney(normalized, available) > 0) return { eligible: false as const, reason: "INSUFFICIENT_AVAILABLE_BALANCE" as const };
  return { eligible: true as const, amount: normalized };
}

export function addReservedAmount(current: string, amount: string) {
  return addMoney(current, amount);
}
