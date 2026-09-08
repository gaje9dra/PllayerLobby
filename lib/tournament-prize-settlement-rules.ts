import { TournamentPrizeSettlementStatus, TournamentPrizeStatus, TournamentResultStatus, TournamentStatus, RegistrationStatus } from "@/app/generated/prisma/client";

export const SETTLEMENT_CURRENCY = "INR";

export function isSettlementTournamentEligible(status: TournamentStatus) {
  return status === TournamentStatus.COMPLETED;
}

export function isSettlementWinnerEligible(input: {
  tournamentStatus: TournamentStatus;
  prizeStatus: TournamentPrizeStatus;
  registrationStatus: RegistrationStatus;
  resultStatus: TournamentResultStatus;
  resultRank: number;
  prizeRank: number;
}) {
  return isSettlementTournamentEligible(input.tournamentStatus)
    && input.prizeStatus === TournamentPrizeStatus.FINALIZED
    && input.registrationStatus === RegistrationStatus.CONFIRMED
    && input.resultStatus === TournamentResultStatus.VERIFIED
    && input.resultRank > 0
    && input.resultRank === input.prizeRank;
}

export function canApproveSettlement(status: TournamentPrizeSettlementStatus) {
  return status === TournamentPrizeSettlementStatus.PENDING;
}

export function canCancelSettlement(status: TournamentPrizeSettlementStatus) {
  return status === TournamentPrizeSettlementStatus.PENDING;
}
