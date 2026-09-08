CREATE TYPE "TournamentPrizeSettlementStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');

CREATE TABLE "TournamentPrizeSettlement" (
  "id" UUID NOT NULL,
  "tournamentId" UUID NOT NULL,
  "prizeId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "resultId" UUID NOT NULL,
  "rank" INTEGER NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "status" "TournamentPrizeSettlementStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentPrizeSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentPrizeSettlement_prizeId_key" UNIQUE ("prizeId"),
  CONSTRAINT "TournamentPrizeSettlement_resultId_key" UNIQUE ("resultId")
);

CREATE INDEX "TournamentPrizeSettlement_tournamentId_status_idx" ON "TournamentPrizeSettlement"("tournamentId", "status");
CREATE INDEX "TournamentPrizeSettlement_registrationId_idx" ON "TournamentPrizeSettlement"("registrationId");

ALTER TABLE "TournamentPrizeSettlement" ADD CONSTRAINT "TournamentPrizeSettlement_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentPrizeSettlement" ADD CONSTRAINT "TournamentPrizeSettlement_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "TournamentPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentPrizeSettlement" ADD CONSTRAINT "TournamentPrizeSettlement_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentPrizeSettlement" ADD CONSTRAINT "TournamentPrizeSettlement_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "TournamentResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TournamentPrizeSettlement" ADD CONSTRAINT "TournamentPrizeSettlement_rank_positive_check" CHECK ("rank" > 0);
ALTER TABLE "TournamentPrizeSettlement" ADD CONSTRAINT "TournamentPrizeSettlement_amount_positive_check" CHECK ("amount" > 0);
