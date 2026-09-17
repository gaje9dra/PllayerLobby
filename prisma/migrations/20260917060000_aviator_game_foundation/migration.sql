CREATE TYPE "AviatorRoundStatus" AS ENUM ('WAITING', 'RUNNING', 'CRASHED', 'SETTLED');

CREATE TABLE "AviatorRound" (
    "id" UUID NOT NULL,
    "status" "AviatorRoundStatus" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "crashedAt" TIMESTAMP(3),
    "crashMultiplier" DECIMAL(12, 2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AviatorRound_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AviatorRound_status_crashedAt_idx" ON "AviatorRound"("status", "crashedAt");
