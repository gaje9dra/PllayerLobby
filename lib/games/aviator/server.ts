import "server-only";

import { AviatorGameEngine, type AviatorRoundSnapshot } from "./engine";

const globalKey = Symbol.for("playerlobby.aviator.engine");
const globalState = globalThis as typeof globalThis & {
  [globalKey]?: AviatorGameEngine;
};

function getEngine() {
  if (!globalState[globalKey]) {
    globalState[globalKey] = new AviatorGameEngine();
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
