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
  if (!row.serverSeedEncrypted || !row.serverSeedHash || !row.clientSeed || row.nonce === null || !row.algorithmVersion || row.crashMultiplier === null) {
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

export async function persistFinalizedAviatorRound(snapshot: AviatorRoundSnapshot, crashMultiplier: number) {
  const round = await prisma.aviatorRound.upsert({
    where: { id: snapshot.roundId },
    create: {
      id: snapshot.roundId,
      status: "SETTLED",
      startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : new Date(snapshot.serverTime),
      crashedAt: new Date(snapshot.serverTime),
      crashMultiplier,
    },
    update: { status: "SETTLED", crashedAt: new Date(snapshot.serverTime), crashMultiplier },
  });

  const rows = await prisma.$queryRaw<Array<{ serverSeed: string | null; serverSeedHash: string | null; clientSeed: string | null; nonce: bigint | null; algorithmVersion: string | null }>>`
    SELECT "serverSeedEncrypted" AS "serverSeed", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion"
    FROM "AviatorRound"
    WHERE "id" = ${snapshot.roundId}::uuid
    LIMIT 1
  `;
  const fairness = rows[0];
  if (fairness?.serverSeed && fairness.serverSeedHash && fairness.clientSeed && fairness.nonce !== null && fairness.algorithmVersion) {
    const serverSeed = decryptAviatorServerSeed(fairness.serverSeed);
    await prisma.$executeRaw`
      UPDATE "AviatorRound"
      SET "fairnessRevealedAt" = COALESCE("fairnessRevealedAt", ${new Date(snapshot.serverTime)})
      WHERE "id" = ${snapshot.roundId}::uuid AND "status" = 'SETTLED'::"AviatorRoundStatus"
    `;
    emitAviatorFairnessEvent({
      type: "fairness:revealed",
      roundId: snapshot.roundId,
      serverSeed,
      serverSeedHash: fairness.serverSeedHash,
      clientSeed: fairness.clientSeed,
      nonce: fairness.nonce.toString(),
      algorithmVersion: fairness.algorithmVersion,
      crashMultiplier,
    });
  }

  return round;
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
