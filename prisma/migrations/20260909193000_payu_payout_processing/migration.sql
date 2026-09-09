DO $$
BEGIN
  CREATE TYPE "PayoutPaymentType" AS ENUM ('UPI', 'IMPS', 'NEFT', 'RTGS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PayoutStatus" AS ENUM ('PAYOUT_INITIATED', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PayoutBeneficiaryStatus" AS ENUM ('ACTIVE', 'PENDING', 'FAILED', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "WalletReferenceType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_PAYOUT';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'PAYOUT_INITIATED';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

CREATE TABLE IF NOT EXISTS "PayoutBeneficiary" (
  "id" UUID NOT NULL,
  "payoutDestinationId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "providerBeneficiaryId" TEXT NOT NULL,
  "status" "PayoutBeneficiaryStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutBeneficiary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payout" (
  "id" UUID NOT NULL,
  "withdrawalRequestId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "merchantTransferId" VARCHAR(40) NOT NULL,
  "providerTransferId" TEXT,
  "providerReference" TEXT,
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "paymentType" "PayoutPaymentType" NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'PAYOUT_INITIATED',
  "failureCode" VARCHAR(128),
  "failureReason" VARCHAR(1000),
  "initiatedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PayoutWebhookEvent" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "merchantTransferId" VARCHAR(40),
  "providerReference" TEXT,
  "fingerprint" CHAR(64) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payoutId" UUID,
  CONSTRAINT "PayoutWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PayoutBeneficiary_payoutDestinationId_provider_key" ON "PayoutBeneficiary"("payoutDestinationId", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutBeneficiary_provider_providerBeneficiaryId_key" ON "PayoutBeneficiary"("provider", "providerBeneficiaryId");
CREATE INDEX IF NOT EXISTS "PayoutBeneficiary_status_idx" ON "PayoutBeneficiary"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "Payout_merchantTransferId_key" ON "Payout"("merchantTransferId");
CREATE UNIQUE INDEX IF NOT EXISTS "Payout_providerTransferId_key" ON "Payout"("providerTransferId");
CREATE INDEX IF NOT EXISTS "Payout_withdrawalRequestId_idx" ON "Payout"("withdrawalRequestId");
CREATE INDEX IF NOT EXISTS "Payout_status_idx" ON "Payout"("status");
CREATE INDEX IF NOT EXISTS "Payout_createdAt_idx" ON "Payout"("createdAt");
CREATE INDEX IF NOT EXISTS "PayoutWebhookEvent_merchantTransferId_idx" ON "PayoutWebhookEvent"("merchantTransferId");
CREATE INDEX IF NOT EXISTS "PayoutWebhookEvent_payoutId_idx" ON "PayoutWebhookEvent"("payoutId");
CREATE INDEX IF NOT EXISTS "PayoutWebhookEvent_receivedAt_idx" ON "PayoutWebhookEvent"("receivedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutWebhookEvent_fingerprint_key" ON "PayoutWebhookEvent"("fingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "Payout_withdrawal_active_key" ON "Payout"("withdrawalRequestId") WHERE "status" IN ('PAYOUT_INITIATED', 'PROCESSING');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayoutBeneficiary_payoutDestinationId_fkey') THEN
    ALTER TABLE "PayoutBeneficiary" ADD CONSTRAINT "PayoutBeneficiary_payoutDestinationId_fkey" FOREIGN KEY ("payoutDestinationId") REFERENCES "PayoutDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payout_withdrawalRequestId_fkey') THEN
    ALTER TABLE "Payout" ADD CONSTRAINT "Payout_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "WithdrawalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayoutWebhookEvent_payoutId_fkey') THEN
    ALTER TABLE "PayoutWebhookEvent" ADD CONSTRAINT "PayoutWebhookEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
