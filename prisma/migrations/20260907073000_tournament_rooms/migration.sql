CREATE TABLE "TournamentRoom" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "roomIdEncrypted" TEXT NOT NULL,
    "roomPasswordEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "TournamentRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentRoom_tournamentId_key" ON "TournamentRoom"("tournamentId");
CREATE INDEX "TournamentRoom_publishedAt_idx" ON "TournamentRoom"("publishedAt");
CREATE INDEX "TournamentRoom_revokedAt_idx" ON "TournamentRoom"("revokedAt");

ALTER TABLE "TournamentRoom" ADD CONSTRAINT "TournamentRoom_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
