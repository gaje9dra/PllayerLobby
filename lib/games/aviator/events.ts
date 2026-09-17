import type { AviatorRoundSnapshot } from "./types";
import type { AviatorServerEvent } from "./state";

export function eventForSnapshot(
  snapshot: AviatorRoundSnapshot,
  previousPhase: AviatorRoundSnapshot["phase"] | null = null,
): AviatorServerEvent {
  if (snapshot.phase === "RUNNING" && previousPhase !== "RUNNING") return { type: "round:started", snapshot };

  switch (snapshot.phase) {
    case "WAITING":
      return { type: "round:waiting", snapshot };
    case "RUNNING":
      return { type: "multiplier:update", snapshot };
    case "CRASHED":
      return { type: "round:crashed", snapshot };
    case "SETTLED":
      return { type: "round:settled", snapshot };
    default:
      throw new Error(`INVALID_GAME_STATE: ${String(snapshot.phase)}`);
  }
}
