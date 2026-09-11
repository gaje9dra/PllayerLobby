-- Compatibility migration for databases that already carried the historical
-- registration migration. The canonical creation now happens in
-- 20260907080000_registration so dependent migrations run in the correct order.
-- Keep this migration idempotent so a fresh database does not attempt to create
-- Registration twice, while existing databases retain their data unchanged.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'RegistrationStatus'
    ) THEN
        CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Registration" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Registration_userId_tournamentId_key" ON "Registration"("userId", "tournamentId");
CREATE INDEX IF NOT EXISTS "Registration_tournamentId_idx" ON "Registration"("tournamentId");
CREATE INDEX IF NOT EXISTS "Registration_userId_idx" ON "Registration"("userId");
CREATE INDEX IF NOT EXISTS "Registration_tournamentId_status_idx" ON "Registration"("tournamentId", "status");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Registration_tournamentId_fkey'
    ) THEN
        ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey"
            FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Registration_userId_fkey'
    ) THEN
        ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
