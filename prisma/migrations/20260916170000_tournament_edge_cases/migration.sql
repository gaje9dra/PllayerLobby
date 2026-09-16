-- Phase 9.11: resilient tournament edge-case state and immutable correction history.
-- MatchResult is created by the later 20260916210000_match_results migration, so its
-- foreign key from this migration is intentionally added by a follow-up migration.

ALTER TABLE "TournamentBracketMatch" DROP CONSTRAINT IF EXISTS "TournamentBracketMatch_status_check";
ALTER TABLE "TournamentBracketMatch"
  ADD CONSTRAINT "TournamentBracketMatch_status_check"
  CHECK ("status" IN ('PENDING','READY','LIVE','COMPLETED','CANCELLED','ABANDONED'));

CREATE TABLE "TournamentMatchParticipantState" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "reason" VARCHAR(1000),
  "actorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentMatchParticipantState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentMatchParticipantState_match_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentMatchParticipantState_registration_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentMatchParticipantState_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentMatchParticipantState_status_check" CHECK ("status" IN ('ACTIVE','NO_SHOW','WITHDRAWN'))
);
CREATE UNIQUE INDEX "TournamentMatchParticipantState_match_registration_key" ON "TournamentMatchParticipantState"("matchId","registrationId");
CREATE INDEX "TournamentMatchParticipantState_match_status_idx" ON "TournamentMatchParticipantState"("matchId","status");
CREATE INDEX "TournamentMatchParticipantState_registration_idx" ON "TournamentMatchParticipantState"("registrationId");

CREATE TABLE "TournamentEdgeCaseAction" (
  "id" UUID NOT NULL,
  "tournamentId" UUID,
  "matchId" UUID,
  "registrationId" UUID,
  "resultId" UUID,
  "action" VARCHAR(64) NOT NULL,
  "reason" VARCHAR(1000),
  "actorUserId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(128),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentEdgeCaseAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentEdgeCaseAction_tournament_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentEdgeCaseAction_match_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentEdgeCaseAction_registration_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentEdgeCaseAction_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TournamentEdgeCaseAction_idempotency_key" ON "TournamentEdgeCaseAction"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX "TournamentEdgeCaseAction_tournament_created_idx" ON "TournamentEdgeCaseAction"("tournamentId","createdAt");
CREATE INDEX "TournamentEdgeCaseAction_match_created_idx" ON "TournamentEdgeCaseAction"("matchId","createdAt");

CREATE TABLE "MatchResultCorrection" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "resultId" UUID NOT NULL,
  "previousWinnerRegistrationId" UUID,
  "previousScores" JSONB NOT NULL,
  "correctedWinnerRegistrationId" UUID,
  "correctedScores" JSONB NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "actorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchResultCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchResultCorrection_match_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MatchResultCorrection_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MatchResultCorrection_match_created_idx" ON "MatchResultCorrection"("matchId","createdAt");
CREATE INDEX "MatchResultCorrection_result_idx" ON "MatchResultCorrection"("resultId");

CREATE TABLE "BracketCorrection" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "slotNumber" INTEGER NOT NULL,
  "previousRegistrationId" UUID,
  "correctedRegistrationId" UUID,
  "reason" VARCHAR(1000) NOT NULL,
  "actorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BracketCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BracketCorrection_match_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BracketCorrection_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BracketCorrection_match_created_idx" ON "BracketCorrection"("matchId","createdAt");
