ALTER TABLE "TournamentBracket"
  ADD COLUMN "participantFormat" VARCHAR(16) NOT NULL DEFAULT 'SOLO';

ALTER TABLE "TournamentBracket"
  ADD CONSTRAINT "TournamentBracket_participantFormat_check"
  CHECK ("participantFormat" IN ('SOLO','DUO','SQUAD','TEAM'));

CREATE INDEX "TournamentBracket_participantFormat_idx" ON "TournamentBracket"("participantFormat");
