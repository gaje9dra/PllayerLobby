import { prisma } from "@/lib/prisma";
import { decryptAviatorServerSeed, encryptAviatorServerSeed } from "./secret";
import { emitAviatorFairnessEvent } from "./fairness-events";
import { hashAviatorServerSeed, verifyAviatorFairness, type AviatorFairnessSecret } from "./provably-fair";
import type { AviatorRoundSnapshot } from "./types";

export type AviatorFairnessReveal = {
  roundId: string;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: string;
  algorithmVersion: string;
  crashMultiplier: number;
};

type FairnessRow = {
  roundId: string;
  serverSeedEncrypted: string | null;
  serverSeedHash: string | null;
  clientSeed: string | null;
  nonce: bigint | null;
  algorithmVersion: string | null;
  crashMultiplier: string | null;
  status: string;
  fairnessRevealedAt: Date | null;
};

export async function persistAviatorFairnessCommitment(snapshot: AviatorRoundSnapshot, fairness: AviatorFairnessSecret) {
  const encryptedSeed = encryptAviatorServerSeed(fairness.serverSeed);
  await prisma.$executeRaw`
    INSERT INTO "AviatorRound" (
      "id", "status", "startedAt", "serverSeedEncrypted", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion"
    ) VALUES (
      ${snapshot.roundId}::uuid, ${snapshot.phase}::"AviatorRoundStatus", ${snapshot.startedAt ? new Date(snapshot.startedAt) : null}, ${encryptedSeed}, ${fairness.serverSeedHash}, ${fairness.clientSeed}, ${BigInt(fairness.nonce)}, ${fairness.algorithmVersion}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "serverSeedEncrypted" = EXCLUDED."serverSeedEncrypted",
      "serverSeedHash" = EXCLUDED."serverSeedHash",
      "clientSeed" = EXCLUDED."clientSeed",
      "nonce" = EXCLUDED."nonce",
      "algorithmVersion" = EXCLUDED."algorithmVersion",
      "status" = EXCLUDED."status",
      "startedAt" = EXCLUDED."startedAt"
    WHERE "AviatorRound"."status" = 'WAITING'::"AviatorRoundStatus"
      AND "AviatorRound"."serverSeedHash" IS NULL
  `;
  return { ...fairness, serverSeed: undefined as never };
}

export async function getAviatorFairnessCommitment(roundId: string) {
  const rows = await prisma.$queryRaw<Array<Pick<FairnessRow, "roundId" | "serverSeedHash" | "clientSeed" | "nonce" | "algorithmVersion" | "status">>>`
    SELECT "id" AS "roundId", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion", "status"
    FROM "AviatorRound"
    WHERE "id" = ${roundId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.serverSeedHash || !row.clientSeed || row.nonce === null || !row.algorithmVersion) return null;
  return {
    roundId: row.roundId,
    serverSeedHash: row.serverSeedHash,
    clientSeed: row.clientSeed,
    nonce: row.nonce.toString(),
    algorithmVersion: row.algorithmVersion,
  };
}

export async function getAviatorFairnessReveal(roundId: string): Promise<{ ok: true; reveal: AviatorFairnessReveal; verification: ReturnType<typeof verifyAviatorFairness> } | { ok: false; code: "ROUND_NOT_FOUND" | "FAIRNESS_DATA_NOT_FOUND" | "ROUND_NOT_COMPLETE" | "INVALID_SERVER_SEED" }> {
  const rows = await prisma.$queryRaw<FairnessRow[]>`
    SELECT
      "id" AS "roundId",
      "serverSeedEncrypted",
      "serverSeedHash",
      "clientSeed",
      "nonce",
      "algorithmVersion",
      "crashMultiplier",
      "status",
      "fairnessRevealedAt"
    FROM "AviatorRound"
    WHERE "id" = ${roundId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { ok: false, code: "ROUND_NOT_FOUND" };
  if (row.status !== "SETTLED") return { ok: false, code: "ROUND_NOT_COMPLETE" };
  if (!row.serverSeedEncrypted || !row.serverSeedHash || !row.clientSeed || row.nonce === null || !row.algorithmVersion || row.crashMultiplier === null || !row.fairnessRevealedAt) {
    return { ok: false, code: "FAIRNESS_DATA_NOT_FOUND" };
  }

  let serverSeed: string;
  try {
    serverSeed = decryptAviatorServerSeed(row.serverSeedEncrypted);
  } catch {
    return { ok: false, code: "INVALID_SERVER_SEED" };
  }

  const reveal: AviatorFairnessReveal = {
    roundId: row.roundId,
    serverSeedHash: row.serverSeedHash,
    serverSeed,
    clientSeed: row.clientSeed,
    nonce: row.nonce.toString(),
    algorithmVersion: row.algorithmVersion,
    crashMultiplier: Number(row.crashMultiplier),
  };
  const verification = verifyAviatorFairness(reveal);
  return { ok: true, reveal, verification };
}

/**
 * Finalize the round and publish its fairness reveal timestamp in one UPDATE.
 * The database trigger intentionally rejects changes to fairnessRevealedAt
 * after a row is already SETTLED, so the timestamp must be written during the
 * transition into SETTLED rather than in a second query after the transition.
 */
export async function persistFinalizedAviatorRound(snapshot: AviatorRoundSnapshot, crashMultiplier: number) {
  const finalizedAt = new Date(snapshot.serverTime);
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    startedAt: Date | null;
    crashedAt: Date | null;
    crashMultiplier: string | null;
    serverSeedEncrypted: string | null;
    serverSeedHash: string | null;
    clientSeed: string | null;
    nonce: bigint | null;
    algorithmVersion: string | null;
    fairnessRevealedAt: Date | null;
  }>>`
    INSERT INTO "AviatorRound" (
      "id", "status", "startedAt", "crashedAt", "crashMultiplier"
    ) VALUES (
      ${snapshot.roundId}::uuid,
      'SETTLED'::"AviatorRoundStatus",
      ${snapshot.startedAt ? new Date(snapshot.startedAt) : finalizedAt},
      ${finalizedAt},
      ${crashMultiplier}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "status" = 'SETTLED'::"AviatorRoundStatus",
      "startedAt" = COALESCE("AviatorRound"."startedAt", EXCLUDED."startedAt"),
      "crashedAt" = EXCLUDED."crashedAt",
      "crashMultiplier" = EXCLUDED."crashMultiplier",
      "fairnessRevealedAt" = CASE
        WHEN "AviatorRound"."status" <> 'SETTLED'::"AviatorRoundStatus"
          AND "AviatorRound"."serverSeedEncrypted" IS NOT NULL
          AND "AviatorRound"."serverSeedHash" IS NOT NULL
          AND "AviatorRound"."clientSeed" IS NOT NULL
          AND "AviatorRound"."nonce" IS NOT NULL
          AND "AviatorRound"."algorithmVersion" IS NOT NULL
        THEN EXCLUDED."crashedAt"
        ELSE "AviatorRound"."fairnessRevealedAt"
      END
    RETURNING
      "id",
      "status"::text AS "status",
      "startedAt",
      "crashedAt",
      "crashMultiplier"::text AS "crashMultiplier",
      "serverSeedEncrypted",
      "serverSeedHash",
      "clientSeed",
      "nonce",
      "algorithmVersion",
      "fairnessRevealedAt"
  `;

  const round = rows[0];
  if (!round) throw new Error("AVIATOR_ROUND_FINALIZATION_FAILED");

  if (round.fairnessRevealedAt && round.serverSeedEncrypted && round.serverSeedHash && round.clientSeed && round.nonce !== null && round.algorithmVersion) {
    const serverSeed = decryptAviatorServerSeed(round.serverSeedEncrypted);
    emitAviatorFairnessEvent({
      type: "fairness:revealed",
      roundId: round.id,
      serverSeed,
      serverSeedHash: round.serverSeedHash,
      clientSeed: round.clientSeed,
      nonce: round.nonce.toString(),
      algorithmVersion: round.algorithmVersion,
      crashMultiplier: Number(round.crashMultiplier ?? crashMultiplier),
    });
  }

  return {
    id: round.id,
    status: "SETTLED" as const,
    startedAt: round.startedAt,
    crashedAt: round.crashedAt,
    crashMultiplier: round.crashMultiplier,
  };
}

export async function getAviatorHistory(limit = 20) {
  const rounds = await prisma.aviatorRound.findMany({
    where: { status: "SETTLED" },
    orderBy: { crashedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, crashMultiplier: true, crashedAt: true },
  });
  return rounds;
}

export function validatePersistedFairnessHash(serverSeed: string, serverSeedHash: string) {
  return hashAviatorServerSeed(serverSeed) === serverSeedHash;
}
