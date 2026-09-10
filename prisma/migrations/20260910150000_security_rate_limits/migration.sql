CREATE TABLE IF NOT EXISTS "SecurityRateLimit" (
  "id" UUID NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SecurityRateLimit_keyHash_key" ON "SecurityRateLimit"("keyHash");
CREATE INDEX IF NOT EXISTS "SecurityRateLimit_windowStartedAt_idx" ON "SecurityRateLimit"("windowStartedAt");
