CREATE TYPE "PayoutPaymentType" AS ENUM ('UPI', 'IMPS', 'NEFT', 'RTGS');
CREATE TYPE "PayoutStatus" AS ENUM ('PAYOUT_INITIATED', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED');
CREATE TYPE "PayoutBeneficiaryStatus" AS ENUM ('ACTIVE', 'PENDING', 'FAILED', 'DISABLED');

ALTER TYPE "WalletReferenceType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_PAYOUT';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'PAYOUT_INITIATED';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

CREATE TABLE "PayoutBeneficiary" (
  "id" UUID NOT NULL,
  "payoutDestinationId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "providerBeneficiaryId" TEXT NOT NULL,
  "status" "PayoutBeneficiaryStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutBeneficiary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payout" (
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

CREATE TABLE "PayoutWebhookEvent" (
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

CREATE UNIQUE INDEX "PayoutBeneficiary_payoutDestinationId_provider_key" ON "PayoutBeneficiary"("payoutDestinationId", "provider");
CREATE UNIQUE INDEX "PayoutBeneficiary_provider_providerBeneficiaryId_key" ON "PayoutBeneficiary"("provider", "providerBeneficiaryId");
CREATE INDEX "PayoutBeneficiary_status_idx" ON "PayoutBeneficiary"("status");
CREATE UNIQUE INDEX "Payout_merchantTransferId_key" ON "Payout"("merchantTransferId");
CREATE UNIQUE INDEX "Payout_providerTransferId_key" ON "Payout"("providerTransferId");
CREATE INDEX "Payout_withdrawalRequestId_idx" ON "Payout"("withdrawalRequestId");
CREATE INDEX "Payout_status_idx" ON "Payout"("status");
CREATE INDEX "Payout_createdAt_idx" ON "Payout"("createdAt");
CREATE INDEX "PayoutWebhookEvent_merchantTransferId_idx" ON "PayoutWebhookEvent"("merchantTransferId");
CREATE INDEX "PayoutWebhookEvent_payoutId_idx" ON "PayoutWebhookEvent"("payoutId");
CREATE INDEX "PayoutWebhookEvent_receivedAt_idx" ON "PayoutWebhookEvent"("receivedAt");
CREATE UNIQUE INDEX "PayoutWebhookEvent_fingerprint_key" ON "PayoutWebhookEvent"("fingerprint");
CREATE UNIQUE INDEX "Payout_withdrawal_active_key" ON "Payout"("withdrawalRequestId") WHERE "status" IN ('PAYOUT_INITIATED', 'PROCESSING');

ALTER TABLE "PayoutBeneficiary" ADD CONSTRAINT "PayoutBeneficiary_payoutDestinationId_fkey" FOREIGN KEY ("payoutDestinationId") REFERENCES "PayoutDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "WithdrawalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutWebhookEvent" ADD CONSTRAINT "PayoutWebhookEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
