export const participantTournamentStatuses = new Set(["UPCOMING", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "LIVE"]);
export const participantMatchStatuses = new Set(["PENDING", "READY", "LIVE"]);

export function canParticipantAccessMatchRoom(tournamentStatus: string, matchStatus: string) {
  return participantTournamentStatuses.has(tournamentStatus) && participantMatchStatuses.has(matchStatus);
}

export function isEligibleMatchRegistration(input: { authenticated: boolean; userActive: boolean; registrationConfirmed: boolean; registrationBelongsToTournament: boolean; registrationOccupiesMatch: boolean }) {
  return input.authenticated && input.userActive && input.registrationConfirmed && input.registrationBelongsToTournament && input.registrationOccupiesMatch;
}
