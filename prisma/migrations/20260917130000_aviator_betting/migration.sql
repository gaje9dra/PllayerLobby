ALTER TYPE "WalletTransactionCategory" ADD VALUE 'AVIATOR_BET';
ALTER TYPE "WalletReferenceType" ADD VALUE 'AVIATOR_BET';

CREATE TYPE "AviatorBetStatus" AS ENUM ('ACTIVE', 'CASHED_OUT', 'LOST', 'CANCELLED');

CREATE TABLE "AviatorBet" (
  "id" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "stake" DECIMAL(20,2) NOT NULL,
  "status" "AviatorBetStatus" NOT NULL DEFAULT 'ACTIVE',
  "clientRequestId" VARCHAR(128) NOT NULL,
  "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cashedOutAt" TIMESTAMP(3),
  "cashoutMultiplier" DECIMAL(12,2),
  "autoCashoutMultiplier" DECIMAL(12,2),
  "payout" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AviatorBet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AviatorBet_userId_clientRequestId_key" ON "AviatorBet"("userId", "clientRequestId");
CREATE INDEX "AviatorBet_roundId_status_idx" ON "AviatorBet"("roundId", "status");
CREATE INDEX "AviatorBet_userId_createdAt_idx" ON "AviatorBet"("userId", "createdAt");
CREATE INDEX "AviatorBet_roundId_userId_createdAt_idx" ON "AviatorBet"("roundId", "userId", "createdAt");

ALTER TABLE "AviatorBet" ADD CONSTRAINT "AviatorBet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AviatorRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AviatorBet" ADD CONSTRAINT "AviatorBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
