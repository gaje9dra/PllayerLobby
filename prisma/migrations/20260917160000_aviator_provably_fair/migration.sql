-- Phase 10.3 stores fairness metadata on the existing AviatorRound table.
-- Existing rounds remain nullable so historical Phase 10.1/10.2 rounds are not fabricated.
ALTER TABLE "AviatorRound"
  ADD COLUMN "serverSeedEncrypted" TEXT,
  ADD COLUMN "serverSeedHash" TEXT,
  ADD COLUMN "clientSeed" TEXT,
  ADD COLUMN "nonce" BIGINT,
  ADD COLUMN "algorithmVersion" VARCHAR(16),
  ADD COLUMN "fairnessRevealedAt" TIMESTAMP(3),
  ADD CONSTRAINT "AviatorRound_serverSeedHash_format_check"
    CHECK ("serverSeedHash" IS NULL OR "serverSeedHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "AviatorRound_nonce_positive_check"
    CHECK ("nonce" IS NULL OR "nonce" > 0),
  ADD CONSTRAINT "AviatorRound_fairness_fields_check"
    CHECK (
      "serverSeedHash" IS NULL
      OR ("serverSeedEncrypted" IS NOT NULL AND "clientSeed" IS NOT NULL AND "nonce" IS NOT NULL AND "algorithmVersion" IS NOT NULL)
    );

CREATE UNIQUE INDEX "AviatorRound_nonce_key"
  ON "AviatorRound"("nonce")
  WHERE "nonce" IS NOT NULL;

CREATE INDEX "AviatorRound_serverSeedHash_idx"
  ON "AviatorRound"("serverSeedHash");

CREATE OR REPLACE FUNCTION "prevent_aviator_fairness_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'WAITING'::"AviatorRoundStatus" AND (
    NEW."serverSeedEncrypted" IS DISTINCT FROM OLD."serverSeedEncrypted" OR
    NEW."serverSeedHash" IS DISTINCT FROM OLD."serverSeedHash" OR
    NEW."clientSeed" IS DISTINCT FROM OLD."clientSeed" OR
    NEW."nonce" IS DISTINCT FROM OLD."nonce" OR
    NEW."algorithmVersion" IS DISTINCT FROM OLD."algorithmVersion"
  ) THEN
    RAISE EXCEPTION 'AVIATOR_FAIRNESS_DATA_IMMUTABLE';
  END IF;

  IF OLD.status = 'SETTLED'::"AviatorRoundStatus" AND (
    NEW."fairnessRevealedAt" IS DISTINCT FROM OLD."fairnessRevealedAt"
  ) THEN
    RAISE EXCEPTION 'AVIATOR_FAIRNESS_REVEAL_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AviatorRound_fairness_immutable"
BEFORE UPDATE ON "AviatorRound"
FOR EACH ROW
EXECUTE FUNCTION "prevent_aviator_fairness_mutation"();
