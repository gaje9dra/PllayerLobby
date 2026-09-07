CREATE TYPE "TournamentPrizeStatus" AS ENUM ('DRAFT', 'FINALIZED');

CREATE TABLE "TournamentPrize" (
  "id" UUID NOT NULL,
  "tournamentId" UUID NOT NULL,
  "rank" INTEGER NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "TournamentPrizeStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentPrize_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentPrize_tournamentId_rank_key" ON "TournamentPrize"("tournamentId", "rank");
CREATE INDEX "TournamentPrize_tournamentId_idx" ON "TournamentPrize"("tournamentId");

ALTER TABLE "TournamentPrize" ADD CONSTRAINT "TournamentPrize_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
