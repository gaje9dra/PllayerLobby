export type AviatorClientRound = {
  roundId: string;
  phase: "WAITING" | "RUNNING" | "CRASHED" | "SETTLED";
  serverTime: number;
  multiplier: number;
  startedAt: number | null;
};
