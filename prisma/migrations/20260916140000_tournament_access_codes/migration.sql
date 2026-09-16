CREATE TYPE "TournamentAccessCodeStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "TournamentAccessCode" (
  "id" UUID NOT NULL,
  "tournamentId" UUID NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "codeEncrypted" TEXT NOT NULL,
  "status" "TournamentAccessCodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "TournamentAccessCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentAccessCode_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TournamentAccessCode_tournamentId_key" ON "TournamentAccessCode"("tournamentId");
CREATE UNIQUE INDEX "TournamentAccessCode_codeHash_key" ON "TournamentAccessCode"("codeHash");
CREATE INDEX "TournamentAccessCode_status_idx" ON "TournamentAccessCode"("status");
CREATE INDEX "TournamentAccessCode_revokedAt_idx" ON "TournamentAccessCode"("revokedAt");
CREATE INDEX "TournamentAccessCode_expiresAt_idx" ON "TournamentAccessCode"("expiresAt");
