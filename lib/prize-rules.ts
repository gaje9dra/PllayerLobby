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

export function compareMoney(a: string, b: string): number {
  const [aw, af] = a.split(".");
  const [bw, bf] = b.split(".");
  const left = BigInt(aw) * 100n + BigInt(af ?? "0");
  const right = BigInt(bw) * 100n + BigInt(bf ?? "0");
  return left < right ? -1 : left > right ? 1 : 0;
}

export function addMoney(values: readonly string[]): string {
  const total = values.reduce((sum, value) => {
    const [whole, fraction = "00"] = value.split(".");
    return sum + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }, 0n);
  return `${total / 100n}.${(total % 100n).toString().padStart(2, "0")}`;
}

export function isPositivePrizeAmount(value: string): boolean {
  return compareMoney(value, "0.00") > 0;
}

export function canFinalizePrizeAllocation(totalAllocated: string, prizePool: string): boolean {
  return compareMoney(totalAllocated, prizePool) === 0;
}
