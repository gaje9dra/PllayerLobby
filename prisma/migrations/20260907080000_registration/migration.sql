-- Registration must exist before tournament results, payments, and prize settlements.
-- This migration is the canonical creation point; the later historical registration
-- migration remains as an idempotent compatibility step for existing databases.

CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "Registration" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Registration_userId_tournamentId_key" ON "Registration"("userId", "tournamentId");
CREATE INDEX "Registration_tournamentId_idx" ON "Registration"("tournamentId");
CREATE INDEX "Registration_userId_idx" ON "Registration"("userId");
CREATE INDEX "Registration_tournamentId_status_idx" ON "Registration"("tournamentId", "status");

ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
