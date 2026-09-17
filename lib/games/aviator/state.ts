import type { AviatorPhase, AviatorRoundSnapshot } from "./engine";

export const AVIATOR_GAME_SLUG = "aviator" as const;

export type AviatorClientMessage = {
  type: "round:sync";
  roundId?: string;
};

export type AviatorServerEvent =
  | { type: "round:waiting"; snapshot: AviatorRoundSnapshot }
  | { type: "round:started"; snapshot: AviatorRoundSnapshot }
  | { type: "multiplier:update"; snapshot: AviatorRoundSnapshot }
  | { type: "round:crashed"; snapshot: AviatorRoundSnapshot }
  | { type: "round:settled"; snapshot: AviatorRoundSnapshot };

export function isAviatorPhase(value: unknown): value is AviatorPhase {
  return value === "WAITING" || value === "RUNNING" || value === "CRASHED" || value === "SETTLED";
}

export function isAviatorClientMessage(value: unknown): value is AviatorClientMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === "round:sync" && (message.roundId === undefined || typeof message.roundId === "string");
}

export function errorResponse(code: "GAME_NOT_FOUND" | "ROUND_NOT_FOUND" | "INVALID_GAME_STATE" | "STALE_ROUND" | "INVALID_MESSAGE" | "RATE_LIMITED" | "WEBSOCKET_NOT_AUTHORIZED") {
  return { error: code } as const;
}
