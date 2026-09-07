import { TournamentStatus } from "@/app/generated/prisma/client";

export type TournamentLifecycleInput = {
  status: TournamentStatus;
  registrationStartTime: Date | null;
  registrationEndTime: Date | null;
  startTime: Date;
};

export const ALLOWED_TOURNAMENT_STATUS_TRANSITIONS: Record<TournamentStatus, readonly TournamentStatus[]> = {
  [TournamentStatus.DRAFT]: [TournamentStatus.DRAFT, TournamentStatus.UPCOMING, TournamentStatus.CANCELLED],
  [TournamentStatus.UPCOMING]: [TournamentStatus.UPCOMING, TournamentStatus.REGISTRATION_OPEN, TournamentStatus.CANCELLED],
  [TournamentStatus.REGISTRATION_OPEN]: [TournamentStatus.REGISTRATION_OPEN, TournamentStatus.REGISTRATION_CLOSED, TournamentStatus.CANCELLED],
  [TournamentStatus.REGISTRATION_CLOSED]: [TournamentStatus.REGISTRATION_CLOSED, TournamentStatus.LIVE, TournamentStatus.CANCELLED],
  [TournamentStatus.LIVE]: [TournamentStatus.LIVE, TournamentStatus.COMPLETED, TournamentStatus.CANCELLED],
  [TournamentStatus.COMPLETED]: [TournamentStatus.COMPLETED, TournamentStatus.CANCELLED],
  [TournamentStatus.CANCELLED]: [TournamentStatus.CANCELLED],
};

export function canTransitionTournamentStatus(from: TournamentStatus, to: TournamentStatus) {
  return ALLOWED_TOURNAMENT_STATUS_TRANSITIONS[from].includes(to);
}

export function getDueTournamentStatus(tournament: TournamentLifecycleInput, now: Date): TournamentStatus | null {
  if (tournament.status === TournamentStatus.DRAFT || tournament.status === TournamentStatus.CANCELLED || tournament.status === TournamentStatus.COMPLETED) return null;
  if (tournament.status === TournamentStatus.UPCOMING) {
    if (tournament.registrationStartTime && now >= tournament.registrationStartTime) return TournamentStatus.REGISTRATION_OPEN;
    return null;
  }
  if (tournament.status === TournamentStatus.REGISTRATION_OPEN) {
    if (!tournament.registrationEndTime || now >= tournament.registrationEndTime) return TournamentStatus.REGISTRATION_CLOSED;
    return null;
  }
  if (tournament.status === TournamentStatus.REGISTRATION_CLOSED && now >= tournament.startTime) return TournamentStatus.LIVE;
  // There is no authoritative endTime in the current schema, so LIVE remains LIVE.
  return null;
}

export function isStatusTransitionDue(tournament: TournamentLifecycleInput, now: Date) {
  return getDueTournamentStatus(tournament, now) !== null;
}

export function canAdminSetTournamentStatus(current: TournamentStatus, next: TournamentStatus, tournament: TournamentLifecycleInput, now: Date) {
  if (!canTransitionTournamentStatus(current, next)) return false;
  if (next === current) return true;
  if (next === TournamentStatus.CANCELLED) return true;
  if (current === TournamentStatus.DRAFT && next === TournamentStatus.UPCOMING) return true;
  return getDueTournamentStatus(tournament, now) === next;
}
