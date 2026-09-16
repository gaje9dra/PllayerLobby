import "server-only";

export const BRACKET_FORMATS = ["SINGLE_ELIMINATION"] as const;
export type BracketFormat = (typeof BRACKET_FORMATS)[number];

export const BRACKET_STATUSES = ["DRAFT", "GENERATED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export const MATCH_STATUSES = ["PENDING", "READY", "LIVE", "COMPLETED", "CANCELLED"] as const;

export function isSupportedBracketFormat(format: string): format is BracketFormat {
  return format === "SINGLE_ELIMINATION";
}

export function canGenerateBracket(tournamentStatus: string) {
  return ["UPCOMING", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(tournamentStatus);
}

export function nextPowerOfTwo(value: number) {
  if (!Number.isInteger(value) || value < 1) throw new Error("INVALID_PARTICIPANT_COUNT");
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

export function roundName(matchCount: number) {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semifinal";
  if (matchCount === 4) return "Quarterfinal";
  if (matchCount === 8) return "Round of 16";
  if (matchCount === 16) return "Round of 32";
  return `Round ${matchCount}`;
}

export function validateGenerationParticipantCount(count: number, maxParticipants: number | null) {
  if (!Number.isInteger(count) || count < 2) throw new Error("INSUFFICIENT_PARTICIPANTS");
  if (maxParticipants !== null && count > maxParticipants) throw new Error("PARTICIPANT_COUNT_EXCEEDS_MAXIMUM");
}
