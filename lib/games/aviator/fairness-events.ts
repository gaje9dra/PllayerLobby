import type { AviatorFairnessCommitment } from "./provably-fair";

export type AviatorFairnessEvent =
  | { type: "fairness:commitment"; commitment: AviatorFairnessCommitment }
  | { type: "fairness:revealed"; roundId: string; serverSeed: string; serverSeedHash: string; clientSeed: string; nonce: string; algorithmVersion: string; crashMultiplier: number };

const listeners = new Set<(event: AviatorFairnessEvent) => void>();

export function subscribeToAviatorFairnessEvents(listener: (event: AviatorFairnessEvent) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAviatorFairnessEvent(event: AviatorFairnessEvent) {
  for (const listener of listeners) listener(event);
}
