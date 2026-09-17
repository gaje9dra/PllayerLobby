import type { AviatorRoundSnapshot } from "./engine";
import type { AviatorServerEvent } from "./state";

export function eventForSnapshot(snapshot: AviatorRoundSnapshot): AviatorServerEvent {
  switch (snapshot.phase) {
    case "WAITING":
      return { type: "round:waiting", snapshot };
    case "RUNNING":
      return { type: "multiplier:update", snapshot };
    case "CRASHED":
      return { type: "round:crashed", snapshot };
    case "SETTLED":
      return { type: "round:settled", snapshot };
  }
}
