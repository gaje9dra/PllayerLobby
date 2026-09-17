import { AviatorGameEngine } from "./engine";
import type { AviatorRoundSnapshot } from "./types";
import { persistFinalizedAviatorRound } from "./persistence";

const globalKey = Symbol.for("playerlobby.aviator.engine");
const globalState = globalThis as typeof globalThis & {
  [globalKey]?: AviatorGameEngine;
};

export function getAviatorEngine() {
  if (!globalState[globalKey]) {
    globalState[globalKey] = new AviatorGameEngine({
      onCrash: async (snapshot, crashPoint) => {
        try {
          // Crash settlement must not load betting.ts: that module imports
          // Next.js server-only request/auth helpers and is also used by API routes.
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
