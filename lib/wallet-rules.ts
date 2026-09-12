export const WALLET_CURRENCY = "INR" as const;
export const WALLET_PAGE_SIZE = 20;

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WALLET_TRANSACTION_TYPES = ["CREDIT", "DEBIT"] as const;
export const WALLET_TRANSACTION_CATEGORIES = ["PRIZE", "REFUND", "WITHDRAWAL", "ENTRY_FEE", "ADJUSTMENT", "DEPOSIT"] as const;
export const WALLET_REFERENCE_TYPES = ["PRIZE_SETTLEMENT", "REFUND", "WITHDRAWAL", "WITHDRAWAL_PAYOUT", "ENTRY_PAYMENT", "ADJUSTMENT", "DEPOSIT"] as const;

export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];
export type WalletTransactionCategory = (typeof WALLET_TRANSACTION_CATEGORIES)[number];
export type WalletReferenceType = (typeof WALLET_REFERENCE_TYPES)[number];

const ZERO_CENTS = BigInt("0");
const HUNDRED_CENTS = BigInt("100");

export function normalizeMoney(value: string): string | null {
  const normalized = value.trim();
  if (!MONEY_PATTERN.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function isPositiveMoney(value: string): boolean {
  const normalized = normalizeMoney(value);
  return normalized !== null && BigInt(normalized.replace(".", "")) > ZERO_CENTS;
}

export function addMoney(a: string, b: string): string {
  const left = normalizeMoney(a);
  const right = normalizeMoney(b);
  if (!left || !right) throw new Error("Invalid monetary amount.");
  const cents = BigInt(left.replace(".", "")) + BigInt(right.replace(".", ""));
  return `${cents / HUNDRED_CENTS}.${(cents % HUNDRED_CENTS).toString().padStart(2, "0")}`;
}

export function subtractMoney(a: string, b: string): string {
  const left = normalizeMoney(a);
  const right = normalizeMoney(b);
  if (!left || !right) throw new Error("Invalid monetary amount.");
  const cents = BigInt(left.replace(".", "")) - BigInt(right.replace(".", ""));
  if (cents < ZERO_CENTS) throw new Error("Money amount cannot be negative.");
  return `${cents / HUNDRED_CENTS}.${(cents % HUNDRED_CENTS).toString().padStart(2, "0")}`;
}

export function compareMoney(a: string, b: string): number {
  const left = normalizeMoney(a);
  const right = normalizeMoney(b);
  if (!left || !right) throw new Error("Invalid monetary amount.");
  const leftCents = BigInt(left.replace(".", ""));
  const rightCents = BigInt(right.replace(".", ""));
  return leftCents < rightCents ? -1 : leftCents > rightCents ? 1 : 0;
}

export function isSupportedCurrency(currency: string): currency is typeof WALLET_CURRENCY {
  return currency.trim().toUpperCase() === WALLET_CURRENCY;
}

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isValidReferenceType(value: string): value is WalletReferenceType {
  return (WALLET_REFERENCE_TYPES as readonly string[]).includes(value);
}

export function isValidTransactionType(value: string): value is WalletTransactionType {
  return (WALLET_TRANSACTION_TYPES as readonly string[]).includes(value);
}

export function isValidTransactionCategory(value: string): value is WalletTransactionCategory {
  return (WALLET_TRANSACTION_CATEGORIES as readonly string[]).includes(value);
}
