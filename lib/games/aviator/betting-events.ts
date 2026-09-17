export type AviatorBetEvent =
  | { type: "bet:placed"; roundId: string; betId: string; stake: string; status: "ACTIVE" }
  | { type: "bet:cashout"; roundId: string; betId: string; multiplier: number; payout: string; status: "CASHED_OUT" }
  | { type: "bet:lost"; roundId: string; betId: string; status: "LOST" }
  | { type: "bet:settled"; roundId: string; betId: string; status: "CASHED_OUT" | "LOST" };

const key = Symbol.for("playerlobby.aviator.bet-events");
const state = globalThis as typeof globalThis & { [key]?: Set<(event: AviatorBetEvent) => void> };

function listeners() {
  if (!state[key]) state[key] = new Set();
  return state[key]!;
}

export function emitAviatorBetEvent(event: AviatorBetEvent) {
  for (const listener of listeners()) listener(event);
}

export function subscribeToAviatorBetEvents(listener: (event: AviatorBetEvent) => void) {
  listeners().add(listener);
  return () => listeners().delete(listener);
}
