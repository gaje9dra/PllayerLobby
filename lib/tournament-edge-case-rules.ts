export const TOURNAMENT_CANCELLABLE_STATUSES = new Set(["DRAFT", "UPCOMING", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "LIVE", "COMPLETED"]);
export const MATCH_CANCELLABLE_STATUSES = new Set(["PENDING", "READY", "LIVE", "ABANDONED"]);
export const MATCH_ABANDONABLE_STATUSES = new Set(["READY", "LIVE"]);
export const RESULT_SUBMIT_BLOCKED_MATCH_STATUSES = new Set(["COMPLETED", "CANCELLED", "ABANDONED"]);

export function canCancelTournament(status: string) {
  return TOURNAMENT_CANCELLABLE_STATUSES.has(status);
}
export function canCancelMatch(status: string) {
  return MATCH_CANCELLABLE_STATUSES.has(status);
}
export function canAbandonMatch(status: string) {
  return MATCH_ABANDONABLE_STATUSES.has(status);
}
export function canSubmitNormalResult(matchStatus: string, tournamentStatus: string) {
  return !RESULT_SUBMIT_BLOCKED_MATCH_STATUSES.has(matchStatus) && tournamentStatus !== "CANCELLED";
}
export function safeEdgeCaseMessage(code: string) {
  const messages: Record<string, string> = {
    CANCELLED_TOURNAMENT: "This tournament has been cancelled.",
    CANCELLED_MATCH: "This match has been cancelled.",
    RESULTS_CLOSED: "This match is no longer accepting results.",
    ROOM_UNAVAILABLE: "Room details are not available yet.",
    DISPUTED_RESULT: "This result is currently under review.",
    PARTICIPANT_MISSING: "Participant not assigned.",
  };
  return messages[code] ?? "The requested operation could not be completed.";
}
