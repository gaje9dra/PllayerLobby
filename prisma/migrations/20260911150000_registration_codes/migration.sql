-- RegistrationCode migration is intentionally idempotent because older development databases
-- may already contain this table from the pre-renamed registration_codes migration.

CREATE TABLE IF NOT EXISTS "RegistrationCode" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "codeEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RegistrationCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RegistrationCode_registrationId_key"
    ON "RegistrationCode"("registrationId");

CREATE UNIQUE INDEX IF NOT EXISTS "RegistrationCode_codeHash_key"
    ON "RegistrationCode"("codeHash");

CREATE INDEX IF NOT EXISTS "RegistrationCode_revokedAt_idx"
    ON "RegistrationCode"("revokedAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'RegistrationCode_registrationId_fkey'
          AND conrelid = '"RegistrationCode"'::regclass
    ) THEN
        ALTER TABLE "RegistrationCode"
            ADD CONSTRAINT "RegistrationCode_registrationId_fkey"
            FOREIGN KEY ("registrationId")
            REFERENCES "Registration"("id")
            ON DELETE RESTRICT
            ON UPDATE CASCADE;
    END IF;
END $$;
