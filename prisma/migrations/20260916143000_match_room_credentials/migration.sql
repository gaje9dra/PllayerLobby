CREATE TABLE "MatchRoomCredential" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "roomIdEncrypted" TEXT NOT NULL,
  "roomPasswordEncrypted" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "updatedById" UUID NOT NULL,
  CONSTRAINT "MatchRoomCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchRoomCredential_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MatchRoomCredential_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MatchRoomCredential_matchId_key" ON "MatchRoomCredential"("matchId");
CREATE INDEX "MatchRoomCredential_publishedAt_idx" ON "MatchRoomCredential"("publishedAt");
CREATE INDEX "MatchRoomCredential_revokedAt_idx" ON "MatchRoomCredential"("revokedAt");
CREATE INDEX "MatchRoomCredential_updatedById_idx" ON "MatchRoomCredential"("updatedById");
