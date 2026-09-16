import { TournamentStatus } from "@/app/generated/prisma/client";

export type RoomAccessReason =
  | "AUTHENTICATION_REQUIRED"
  | "USER_INACTIVE"
  | "TOURNAMENT_NOT_FOUND"
  | "TOURNAMENT_CANCELLED"
  | "TOURNAMENT_COMPLETED"
  | "REGISTRATION_NOT_FOUND"
  | "REGISTRATION_NOT_CONFIRMED"
  | "REGISTRATION_OWNERSHIP_FAILED"
  | "INVALID_CODE"
  | "JOINING_WINDOW_CLOSED"
  | "ROOM_NOT_READY"
  | "ROOM_REVOKED";

const PARTICIPANT_JOINABLE_STATUSES: TournamentStatus[] = [
  TournamentStatus.UPCOMING,
  TournamentStatus.REGISTRATION_OPEN,
  TournamentStatus.REGISTRATION_CLOSED,
  TournamentStatus.LIVE,
];

const PARTICIPANT_MATCH_JOINABLE_STATUSES = new Set(["PENDING", "READY", "LIVE"]);
const PARTICIPANT_MATCH_CLOSED_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

export function getJoiningWindowStart(startTime: Date, joiningWindowMinutes: number) {
  return new Date(startTime.getTime() - Math.max(0, joiningWindowMinutes) * 60_000);
}

export function isJoiningWindowOpen(now: Date, startTime: Date, joiningWindowMinutes: number) {
  const windowStart = getJoiningWindowStart(startTime, joiningWindowMinutes);
  return now >= windowStart && now < startTime;
}

export function isTournamentJoinableStatus(status: TournamentStatus) {
  return PARTICIPANT_JOINABLE_STATUSES.includes(status);
}

export function isParticipantMatchJoinable(matchStatus: string) {
  return PARTICIPANT_MATCH_JOINABLE_STATUSES.has(matchStatus) && !PARTICIPANT_MATCH_CLOSED_STATUSES.has(matchStatus);
}

export function isParticipantMatchClosed(matchStatus: string) {
  return PARTICIPANT_MATCH_CLOSED_STATUSES.has(matchStatus);
}
