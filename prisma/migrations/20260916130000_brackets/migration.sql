CREATE TABLE "TournamentBracket" (
  "id" UUID NOT NULL,
  "tournamentId" UUID NOT NULL,
  "format" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentBracket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentBracket_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracket_format_check" CHECK ("format" IN ('SINGLE_ELIMINATION','ROUND_ROBIN')),
  CONSTRAINT "TournamentBracket_status_check" CHECK ("status" IN ('DRAFT','GENERATED','ACTIVE','COMPLETED','CANCELLED'))
);

CREATE UNIQUE INDEX "TournamentBracket_tournamentId_key" ON "TournamentBracket"("tournamentId");
CREATE INDEX "TournamentBracket_status_idx" ON "TournamentBracket"("status");

CREATE TABLE "TournamentBracketRound" (
  "id" UUID NOT NULL,
  "bracketId" UUID NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentBracketRound_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentBracketRound_bracketId_fkey" FOREIGN KEY ("bracketId") REFERENCES "TournamentBracket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracketRound_status_check" CHECK ("status" IN ('PENDING','ACTIVE','COMPLETED','CANCELLED'))
);

CREATE UNIQUE INDEX "TournamentBracketRound_bracketId_roundNumber_key" ON "TournamentBracketRound"("bracketId","roundNumber");
CREATE INDEX "TournamentBracketRound_bracketId_idx" ON "TournamentBracketRound"("bracketId");

CREATE TABLE "TournamentBracketMatch" (
  "id" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "matchNumber" INTEGER NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "winnerSlot" INTEGER,
  "winnerRegistrationId" UUID,
  "scheduledTime" TIMESTAMP(3),
  "nextMatchId" UUID,
  "nextSlot" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentBracketMatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentBracketMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "TournamentBracketRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracketMatch_winnerRegistrationId_fkey" FOREIGN KEY ("winnerRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracketMatch_nextMatchId_fkey" FOREIGN KEY ("nextMatchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracketMatch_status_check" CHECK ("status" IN ('PENDING','READY','LIVE','COMPLETED','CANCELLED')),
  CONSTRAINT "TournamentBracketMatch_winnerSlot_check" CHECK ("winnerSlot" IS NULL OR "winnerSlot" IN (1,2)),
  CONSTRAINT "TournamentBracketMatch_nextSlot_check" CHECK ("nextSlot" IS NULL OR "nextSlot" IN (1,2))
);

CREATE UNIQUE INDEX "TournamentBracketMatch_roundId_matchNumber_key" ON "TournamentBracketMatch"("roundId","matchNumber");
CREATE INDEX "TournamentBracketMatch_roundId_idx" ON "TournamentBracketMatch"("roundId");
CREATE INDEX "TournamentBracketMatch_nextMatchId_idx" ON "TournamentBracketMatch"("nextMatchId");
CREATE INDEX "TournamentBracketMatch_winnerRegistrationId_idx" ON "TournamentBracketMatch"("winnerRegistrationId");

CREATE TABLE "TournamentBracketSlot" (
  "id" UUID NOT NULL,
  "bracketId" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "slotNumber" INTEGER NOT NULL,
  "registrationId" UUID,
  "seed" INTEGER,
  "isBye" BOOLEAN NOT NULL DEFAULT false,
  "sourceMatchId" UUID,
  "sourceSlot" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentBracketSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentBracketSlot_bracketId_fkey" FOREIGN KEY ("bracketId") REFERENCES "TournamentBracket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracketSlot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracketSlot_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracketSlot_sourceMatchId_fkey" FOREIGN KEY ("sourceMatchId") REFERENCES "TournamentBracketMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TournamentBracketSlot_slotNumber_check" CHECK ("slotNumber" IN (1,2)),
  CONSTRAINT "TournamentBracketSlot_sourceSlot_check" CHECK ("sourceSlot" IS NULL OR "sourceSlot" IN (1,2))
);

CREATE UNIQUE INDEX "TournamentBracketSlot_matchId_slotNumber_key" ON "TournamentBracketSlot"("matchId","slotNumber");
CREATE UNIQUE INDEX "TournamentBracketSlot_bracketId_registrationId_key" ON "TournamentBracketSlot"("bracketId","registrationId");
CREATE INDEX "TournamentBracketSlot_bracketId_idx" ON "TournamentBracketSlot"("bracketId");
CREATE INDEX "TournamentBracketSlot_registrationId_idx" ON "TournamentBracketSlot"("registrationId");
CREATE INDEX "TournamentBracketSlot_sourceMatchId_idx" ON "TournamentBracketSlot"("sourceMatchId");
