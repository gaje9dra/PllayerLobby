CREATE TABLE "TournamentGameConfig" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tournamentId" UUID NOT NULL,
  "gameId" UUID NOT NULL,
  "gameCode" VARCHAR(64) NOT NULL,
  "configuration" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentGameConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentGameConfig_tournamentId_key" UNIQUE ("tournamentId"),
  CONSTRAINT "TournamentGameConfig_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentGameConfig_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TournamentGameConfig_gameId_idx" ON "TournamentGameConfig"("gameId");
CREATE INDEX "TournamentGameConfig_gameCode_idx" ON "TournamentGameConfig"("gameCode");
