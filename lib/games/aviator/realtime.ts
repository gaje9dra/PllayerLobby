import "server-only";

import { eventForSnapshot } from "./events";
import { subscribeToAviatorRounds } from "./server";
import type { AviatorServerEvent } from "./state";

export type AviatorSubscriber = (event: AviatorServerEvent) => void;

export function subscribeToAviatorEvents(subscriber: AviatorSubscriber) {
  return subscribeToAviatorRounds((snapshot) => subscriber(eventForSnapshot(snapshot)));
}
