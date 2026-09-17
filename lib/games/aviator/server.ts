import { AviatorGameEngine } from "./engine";
import type { AviatorRoundSnapshot } from "./types";
import { persistFinalizedAviatorRound } from "./persistence";

const globalKey = Symbol.for("playerlobby.aviator.engine");
const globalState = globalThis as typeof globalThis & {
  [globalKey]?: AviatorGameEngine;
};

function getEngine() {
  if (!globalState[globalKey]) {
    globalState[globalKey] = new AviatorGameEngine({
      onCrash: async (snapshot, crashPoint) => {
        try {
          await persistFinalizedAviatorRound(snapshot, crashPoint);
        } catch (error) {
          console.error("[aviator] failed to persist finalized round", error);
        }
      },
    });
    globalState[globalKey].start();
  }
  return globalState[globalKey];
}

export function getAviatorRoundSnapshot(): AviatorRoundSnapshot {
  return getEngine().getSnapshot();
}

export function subscribeToAviatorRounds(listener: (snapshot: AviatorRoundSnapshot) => void) {
  return getEngine().subscribe(listener);
}
