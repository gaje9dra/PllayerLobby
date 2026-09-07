import {
  RegistrationStatus,
  TournamentStatus,
  UserRole,
  UserStatus,
} from "@/app/generated/prisma/client";

export const REGISTRATION_ELIGIBILITY_REASONS = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  USER_NOT_ACTIVE: "USER_NOT_ACTIVE",
  USER_ROLE_NOT_ALLOWED: "USER_ROLE_NOT_ALLOWED",
  TOURNAMENT_NOT_FOUND: "TOURNAMENT_NOT_FOUND",
  REGISTRATION_NOT_OPEN: "REGISTRATION_NOT_OPEN",
  REGISTRATION_NOT_STARTED: "REGISTRATION_NOT_STARTED",
  REGISTRATION_CLOSED: "REGISTRATION_CLOSED",
  TOURNAMENT_FULL: "TOURNAMENT_FULL",
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
} as const;

export type RegistrationEligibilityReason =
  (typeof REGISTRATION_ELIGIBILITY_REASONS)[keyof typeof REGISTRATION_ELIGIBILITY_REASONS];

export type RegistrationEligibilityResult =
  | { allowed: true }
  | { allowed: false; reason: RegistrationEligibilityReason };

export type RegistrationCapacity = {
  maxParticipants: number | null;
  confirmedParticipants: number;
  remainingSlots: number | null;
};

export type RegistrationEligibilityUser = {
  role: UserRole;
  status: UserStatus;
};

export type RegistrationEligibilityTournament = {
  status: TournamentStatus;
  registrationStartTime: Date | null;
  registrationEndTime: Date | null;
  maxParticipants: number | null;
};

export type EligibilityRegistration = {
  status: RegistrationStatus;
} | null;

export function evaluateRegistrationEligibility({
  user,
  tournament,
  registration,
  confirmedParticipants,
  now,
}: {
  user: RegistrationEligibilityUser | null;
  tournament: RegistrationEligibilityTournament | null;
  registration: EligibilityRegistration;
  confirmedParticipants: number;
  now: Date;
}): RegistrationEligibilityResult {
  if (!user) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.UNAUTHENTICATED };
  }

  if (user.status !== UserStatus.ACTIVE) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.USER_NOT_ACTIVE };
  }

  if (user.role !== UserRole.USER) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.USER_ROLE_NOT_ALLOWED };
  }

  if (!tournament) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.TOURNAMENT_NOT_FOUND };
  }

  if (tournament.status !== TournamentStatus.REGISTRATION_OPEN) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_NOT_OPEN };
  }

  if (!tournament.registrationStartTime || now < tournament.registrationStartTime) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_NOT_STARTED };
  }

  if (!tournament.registrationEndTime || now >= tournament.registrationEndTime) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_CLOSED };
  }

  if (registration && registration.status !== RegistrationStatus.CANCELLED) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.ALREADY_REGISTERED };
  }

  if (tournament.maxParticipants !== null && confirmedParticipants >= tournament.maxParticipants) {
    return { allowed: false, reason: REGISTRATION_ELIGIBILITY_REASONS.TOURNAMENT_FULL };
  }

  return { allowed: true };
}

export function getRemainingSlots(maxParticipants: number | null, confirmedParticipants: number) {
  if (maxParticipants === null) return null;
  return Math.max(maxParticipants - confirmedParticipants, 0);
}
