-- Phase 5.4: payout destinations and withdrawal destination snapshots

CREATE TYPE "PayoutDestinationType" AS ENUM ('UPI', 'BANK_ACCOUNT');
CREATE TYPE "PayoutDestinationStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'DISABLED');

CREATE TABLE "PayoutDestination" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "PayoutDestinationType" NOT NULL,
  "status" "PayoutDestinationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "displayName" VARCHAR(100) NOT NULL,
  "maskedDestination" VARCHAR(64) NOT NULL,
  "encryptedDestinationData" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "PayoutDestination_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WithdrawalRequest"
  ADD COLUMN "payoutDestinationId" UUID,
  ADD COLUMN "destinationTypeSnapshot" "PayoutDestinationType",
  ADD COLUMN "destinationMaskedSnapshot" VARCHAR(64),
  ADD COLUMN "encryptedDestinationSnapshot" TEXT;

CREATE INDEX "PayoutDestination_userId_status_idx" ON "PayoutDestination"("userId", "status");
CREATE INDEX "PayoutDestination_createdAt_idx" ON "PayoutDestination"("createdAt");
CREATE INDEX "WithdrawalRequest_payoutDestinationId_idx" ON "WithdrawalRequest"("payoutDestinationId");

ALTER TABLE "PayoutDestination"
  ADD CONSTRAINT "PayoutDestination_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WithdrawalRequest"
  ADD CONSTRAINT "WithdrawalRequest_payoutDestinationId_fkey"
  FOREIGN KEY ("payoutDestinationId") REFERENCES "PayoutDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
