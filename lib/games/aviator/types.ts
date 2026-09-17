export const AVIATOR_PHASES = ["WAITING", "RUNNING", "CRASHED", "SETTLED"] as const;
export type AviatorPhase = (typeof AVIATOR_PHASES)[number];
export type AviatorRoundStatus = AviatorPhase;

export type AviatorRoundSnapshot = {
  roundId: string;
  phase: AviatorPhase;
  serverTime: number;
  multiplier: number;
  startedAt: number | null;
  waitingEndsAt: number | null;
};
