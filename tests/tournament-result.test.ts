import test from "node:test";
import assert from "node:assert/strict";
import { RegistrationStatus, TournamentResultStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { canEditTournamentResult, canTransitionResultStatus, isWinnerEligible, parsePositiveRank, parseScore } from "@/lib/tournament-result-rules";

test("rank validation accepts positive integers only", () => {
  assert.equal(parsePositiveRank("1"), 1);
  assert.equal(parsePositiveRank("20"), 20);
  assert.equal(parsePositiveRank("0"), null);
  assert.equal(parsePositiveRank("-1"), null);
  assert.equal(parsePositiveRank("1.5"), null);
  assert.equal(parsePositiveRank("abc"), null);
});

test("score validation accepts non-negative numeric values with bounded precision", () => {
  assert.equal(parseScore("0"), 0);
  assert.equal(parseScore("12.345678"), 12.345678);
  assert.equal(parseScore("12.3456789"), null);
  assert.equal(parseScore("-1"), null);
  assert.equal(parseScore("abc"), null);
});

test("result transitions are controlled", () => {
  assert.equal(canTransitionResultStatus(TournamentResultStatus.DRAFT, TournamentResultStatus.VERIFIED), true);
  assert.equal(canTransitionResultStatus(TournamentResultStatus.DRAFT, TournamentResultStatus.DISQUALIFIED), true);
  assert.equal(canTransitionResultStatus(TournamentResultStatus.VERIFIED, TournamentResultStatus.DISQUALIFIED), true);
  assert.equal(canTransitionResultStatus(TournamentResultStatus.VERIFIED, TournamentResultStatus.DRAFT), false);
  assert.equal(canTransitionResultStatus(TournamentResultStatus.DISQUALIFIED, TournamentResultStatus.VERIFIED), false);
});

test("only DRAFT results are editable", () => {
  assert.equal(canEditTournamentResult(TournamentResultStatus.DRAFT), true);
  assert.equal(canEditTournamentResult(TournamentResultStatus.VERIFIED), false);
  assert.equal(canEditTournamentResult(TournamentResultStatus.DISQUALIFIED), false);
});

test("winner eligibility requires completed/live tournament, confirmed registration and verified result", () => {
  const base = { rank: 1, tournamentStatus: TournamentStatus.COMPLETED, registrationStatus: RegistrationStatus.CONFIRMED, resultStatus: TournamentResultStatus.VERIFIED };
  assert.equal(isWinnerEligible(base), true);
  assert.equal(isWinnerEligible({ ...base, registrationStatus: RegistrationStatus.PENDING }), false);
  assert.equal(isWinnerEligible({ ...base, registrationStatus: RegistrationStatus.CANCELLED }), false);
  assert.equal(isWinnerEligible({ ...base, resultStatus: TournamentResultStatus.DRAFT }), false);
  assert.equal(isWinnerEligible({ ...base, resultStatus: TournamentResultStatus.DISQUALIFIED }), false);
  assert.equal(isWinnerEligible({ ...base, tournamentStatus: TournamentStatus.UPCOMING }), false);
  assert.equal(isWinnerEligible({ ...base, rank: 0 }), false);
});
