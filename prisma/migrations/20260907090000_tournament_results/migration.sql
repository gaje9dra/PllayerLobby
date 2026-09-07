CREATE TYPE "TournamentResultStatus" AS ENUM ('DRAFT', 'VERIFIED', 'DISQUALIFIED');

CREATE TABLE "TournamentResult" (
  "id" UUID NOT NULL,
  "tournamentId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "rank" INTEGER NOT NULL,
  "score" DECIMAL(20,6) NOT NULL,
  "resultStatus" "TournamentResultStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentResult_registrationId_key" ON "TournamentResult"("registrationId");
CREATE INDEX "TournamentResult_tournamentId_rank_idx" ON "TournamentResult"("tournamentId", "rank");
CREATE INDEX "TournamentResult_tournamentId_resultStatus_idx" ON "TournamentResult"("tournamentId", "resultStatus");

ALTER TABLE "TournamentResult" ADD CONSTRAINT "TournamentResult_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentResult" ADD CONSTRAINT "TournamentResult_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
