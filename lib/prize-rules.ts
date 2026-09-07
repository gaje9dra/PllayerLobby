export const PRIZE_AMOUNT_SCALE = 2;

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function parsePrizeRank(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const rank = Number(normalized);
  if (!Number.isSafeInteger(rank) || rank <= 0) return null;
  return rank;
}

export function normalizePrizeAmount(value: string): string | null {
  const normalized = value.trim();
  if (!MONEY_PATTERN.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return `${whole}.${fraction.padEnd(PRIZE_AMOUNT_SCALE, "0")}`;
}

function toCents(value: string): bigint {
  const [whole, fraction = "00"] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromCents(cents: bigint): string {
  if (cents < 0n) throw new Error("Money amount cannot be negative.");
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function compareMoney(a: string, b: string): number {
  const left = toCents(a);
  const right = toCents(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function addMoney(values: readonly string[]): string {
  return fromCents(values.reduce((sum, value) => sum + toCents(value), 0n));
}

export function subtractMoney(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function isPositivePrizeAmount(value: string): boolean {
  return compareMoney(value, "0.00") > 0;
}

export function canFinalizePrizeAllocation(totalAllocated: string, prizePool: string): boolean {
  return compareMoney(totalAllocated, prizePool) === 0;
}
