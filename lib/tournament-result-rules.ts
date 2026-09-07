import { RegistrationStatus, TournamentResultStatus, TournamentStatus } from "@/app/generated/prisma/client";

export const RESULT_SCORE_SCALE = 6;

export function parsePositiveRank(value: string) {
  const rank = Number(value.trim());
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

export function parseScore(value: string) {
  const normalized = value.trim();
  if (!/^(?:\d+)(?:\.\d{1,6})?$/.test(normalized)) return null;
  return normalized;
}

export function isResultTournamentEligible(status: TournamentStatus) {
  return status === TournamentStatus.LIVE || status === TournamentStatus.COMPLETED;
}

export function isRegistrationResultEligible(status: RegistrationStatus) {
  return status === RegistrationStatus.CONFIRMED;
}

export function canEditTournamentResult(status: TournamentResultStatus) {
  return status === TournamentResultStatus.DRAFT;
}

export function canTransitionResultStatus(from: TournamentResultStatus, to: TournamentResultStatus) {
  if (from === TournamentResultStatus.DRAFT) return to === TournamentResultStatus.VERIFIED || to === TournamentResultStatus.DISQUALIFIED;
  if (from === TournamentResultStatus.VERIFIED) return to === TournamentResultStatus.DISQUALIFIED;
  return false;
}

export function isOfficialResult(status: TournamentResultStatus) {
  return status === TournamentResultStatus.VERIFIED;
}

export function isWinnerEligible(input: { tournamentStatus: TournamentStatus; registrationStatus: RegistrationStatus; resultStatus: TournamentResultStatus; rank: number }) {
  return isResultTournamentEligible(input.tournamentStatus) && isRegistrationResultEligible(input.registrationStatus) && isOfficialResult(input.resultStatus) && Number.isInteger(input.rank) && input.rank > 0;
}
