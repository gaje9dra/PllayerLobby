import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationStatus, TournamentPrizeSettlementStatus, TournamentPrizeStatus, TournamentResultStatus, TournamentStatus } from "../app/generated/prisma/client";
import { canApproveSettlement, canCancelSettlement, isSettlementTournamentEligible, isSettlementWinnerEligible } from "../lib/tournament-prize-settlement-rules";

test("only completed tournaments are settlement eligible", () => {
  assert.equal(isSettlementTournamentEligible(TournamentStatus.COMPLETED), true);
  assert.equal(isSettlementTournamentEligible(TournamentStatus.LIVE), false);
  assert.equal(isSettlementTournamentEligible(TournamentStatus.CANCELLED), false);
});

test("winner requires finalized prize, confirmed registration and verified matching result", () => {
  const base = { tournamentStatus: TournamentStatus.COMPLETED, prizeStatus: TournamentPrizeStatus.FINALIZED, registrationStatus: RegistrationStatus.CONFIRMED, resultStatus: TournamentResultStatus.VERIFIED, resultRank: 1, prizeRank: 1 };
  assert.equal(isSettlementWinnerEligible(base), true);
  assert.equal(isSettlementWinnerEligible({ ...base, prizeStatus: TournamentPrizeStatus.DRAFT }), false);
  assert.equal(isSettlementWinnerEligible({ ...base, registrationStatus: RegistrationStatus.PENDING }), false);
  assert.equal(isSettlementWinnerEligible({ ...base, resultStatus: TournamentResultStatus.DRAFT }), false);
  assert.equal(isSettlementWinnerEligible({ ...base, resultStatus: TournamentResultStatus.DISQUALIFIED }), false);
  assert.equal(isSettlementWinnerEligible({ ...base, resultRank: 2 }), false);
});

test("settlement approval and cancellation only allow pending", () => {
  assert.equal(canApproveSettlement(TournamentPrizeSettlementStatus.PENDING), true);
  assert.equal(canApproveSettlement(TournamentPrizeSettlementStatus.APPROVED), false);
  assert.equal(canApproveSettlement(TournamentPrizeSettlementStatus.CREDITED), false);
  assert.equal(canCancelSettlement(TournamentPrizeSettlementStatus.PENDING), true);
  assert.equal(canCancelSettlement(TournamentPrizeSettlementStatus.APPROVED), false);
  assert.equal(canCancelSettlement(TournamentPrizeSettlementStatus.CREDITED), false);
  assert.equal(canCancelSettlement(TournamentPrizeSettlementStatus.CANCELLED), false);
});
