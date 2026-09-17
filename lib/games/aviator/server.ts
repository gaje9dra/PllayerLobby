import { emitAviatorFairnessEvent } from "./fairness-events";
import { persistAviatorFairnessCommitment, persistFinalizedAviatorRound } from "./persistence";
import { toAviatorFairnessCommitment } from "./provably-fair";
import { AviatorGameEngine } from "./engine";
import type { AviatorRoundSnapshot } from "./types";

const globalKey = Symbol.for("playerlobby.aviator.engine");
const globalState = globalThis as typeof globalThis & {
  [globalKey]?: AviatorGameEngine;
};

export function getAviatorEngine() {
  if (!globalState[globalKey]) {
    globalState[globalKey] = new AviatorGameEngine({
      onRoundCreated: async (snapshot, fairness) => {
        await persistAviatorFairnessCommitment(snapshot, fairness);
        emitAviatorFairnessEvent({ type: "fairness:commitment", commitment: toAviatorFairnessCommitment(fairness) });
      },
      onCrash: async (snapshot, crashPoint) => {
        try {
          const { settleAviatorCrash } = await import("./settlement");
          await settleAviatorCrash(snapshot, crashPoint);
          await persistFinalizedAviatorRound(snapshot, crashPoint);
        } catch (error) {
          console.error("[aviator] failed to settle finalized round", error);
          throw error;
        }
      },
    });
    globalState[globalKey].start();
  }
  return globalState[globalKey];
}

export function getAviatorRoundSnapshot(): AviatorRoundSnapshot {
  return getAviatorEngine().getSnapshot();
}

export function subscribeToAviatorRounds(listener: (snapshot: AviatorRoundSnapshot) => void) {
  return getAviatorEngine().subscribe(listener);
}
