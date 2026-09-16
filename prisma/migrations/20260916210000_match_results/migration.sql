ALTER TABLE "Tournament"
  ADD COLUMN "winnerRegistrationId" UUID;

ALTER TABLE "Tournament"
  ADD CONSTRAINT "Tournament_winnerRegistrationId_fkey"
  FOREIGN KEY ("winnerRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Tournament_winnerRegistrationId_idx" ON "Tournament"("winnerRegistrationId");

CREATE TABLE "MatchResult" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "submittedById" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "winnerRegistrationId" UUID,
  "scores" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedById" UUID,
  "verifiedAt" TIMESTAMP(3),
  "rejectionReason" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MatchResult_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MatchResult_winnerRegistrationId_fkey" FOREIGN KEY ("winnerRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MatchResult_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MatchResult_status_check" CHECK ("status" IN ('PENDING','VERIFIED','REJECTED','DISPUTED','CANCELLED'))
);

CREATE INDEX "MatchResult_matchId_idx" ON "MatchResult"("matchId");
CREATE INDEX "MatchResult_status_idx" ON "MatchResult"("status");
CREATE INDEX "MatchResult_submittedById_idx" ON "MatchResult"("submittedById");
CREATE INDEX "MatchResult_winnerRegistrationId_idx" ON "MatchResult"("winnerRegistrationId");
CREATE UNIQUE INDEX "MatchResult_one_verified_per_match_key" ON "MatchResult"("matchId") WHERE "status" = 'VERIFIED';
