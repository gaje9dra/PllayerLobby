-- MatchResult is created by 20260916210000_match_results.
-- Add the edge-case audit FK only after that table exists.
ALTER TABLE "TournamentEdgeCaseAction"
  ADD CONSTRAINT "TournamentEdgeCaseAction_result_fkey"
  FOREIGN KEY ("resultId") REFERENCES "MatchResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MatchResultCorrection"
  ADD CONSTRAINT "MatchResultCorrection_result_fkey"
  FOREIGN KEY ("resultId") REFERENCES "MatchResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
