DO $$
BEGIN
  CREATE TYPE "PayoutReconciliationStatus" AS ENUM ('NOT_CHECKED', 'PENDING', 'MATCHED', 'FAILED', 'REVERSED', 'MISMATCH', 'CONFLICT', 'REQUIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Payout"
  ADD COLUMN IF NOT EXISTS "previousPayoutId" UUID,
  ADD COLUMN IF NOT EXISTS "reconciliationStatus" "PayoutReconciliationStatus" NOT NULL DEFAULT 'NOT_CHECKED',
  ADD COLUMN IF NOT EXISTS "reconciliationMessage" VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);

ALTER TABLE "PayoutWebhookEvent"
  ADD COLUMN IF NOT EXISTS "sanitizedPayload" TEXT,
  ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Payout_reconciliationStatus_idx" ON "Payout"("reconciliationStatus");
CREATE INDEX IF NOT EXISTS "Payout_previousPayoutId_idx" ON "Payout"("previousPayoutId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payout_previousPayoutId_fkey') THEN
    ALTER TABLE "Payout"
      ADD CONSTRAINT "Payout_previousPayoutId_fkey"
      FOREIGN KEY ("previousPayoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
