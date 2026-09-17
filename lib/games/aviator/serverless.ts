import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptAviatorServerSeed, encryptAviatorServerSeed } from "./secret";
import { calculateAviatorCrashMultiplier, createAviatorFairnessRound } from "./provably-fair";
import { settleAviatorCrash } from "./settlement";
import { persistFinalizedAviatorRound } from "./persistence";
import type { AviatorRoundSnapshot } from "./types";

const WAITING_MS = 5_000;
const SETTLED_MS = 1_000;
const UPDATE_EVERY_MS = 100;

// This adapter is intentionally database-backed. Netlify runs Next.js route handlers
// as ephemeral serverless functions, so an in-memory game engine cannot be the
// authoritative source of round state across requests.
type RoundRow = {
  id: string;
  status: "WAITING" | "RUNNING" | "CRASHED" | "SETTLED";
  startedAt: Date | null;
  crashedAt: Date | null;
  crashMultiplier: string | null;
  createdAt: Date;
  serverSeedEncrypted: string | null;
  serverSeedHash: string | null;
  clientSeed: string | null;
  nonce: bigint | null;
  algorithmVersion: string | null;
};

function multiplierAt(startedAt: Date, now: number) {
  const elapsed = Math.max(0, now - startedAt.getTime()) / 1000;
  return Number(Math.exp(elapsed * 0.12).toFixed(2));
}

function randomNonce() {
  return (BigInt(Date.now()) * 1_000_000n + (BigInt(`0x${randomBytes(4).toString("hex")}`) % 1_000_000n)).toString();
}

async function createRound() {
  const id = randomUUID();
  const fairness = createAviatorFairnessRound(id);
  // The process-local nonce helper is not safe across serverless instances, so use
  // a timestamp/random nonce for this DB-backed runtime.
  const nonce = randomNonce();
  const encryptedSeed = encryptAviatorServerSeed(fairness.serverSeed);
  await prisma.$executeRaw`
    INSERT INTO "AviatorRound" (
      "id", "status", "serverSeedEncrypted", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion"
    ) VALUES (
      ${id}::uuid, 'WAITING'::"AviatorRoundStatus", ${encryptedSeed}, ${fairness.serverSeedHash}, ${fairness.clientSeed}, ${BigInt(nonce)}, ${fairness.algorithmVersion}
    )
  `;
  return getRound(id);
}

async function getRound(id: string) {
  const rows = await prisma.$queryRaw<RoundRow[]>`
    SELECT
      "id", "status", "startedAt", "crashedAt", "crashMultiplier", "createdAt",
      "serverSeedEncrypted", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion"
    FROM "AviatorRound"
    WHERE "id" = ${id}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getLatestActiveRound() {
  const rows = await prisma.$queryRaw<RoundRow[]>`
    SELECT
      "id", "status", "startedAt", "crashedAt", "crashMultiplier", "createdAt",
      "serverSeedEncrypted", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion"
    FROM "AviatorRound"
    WHERE "status" IN ('WAITING'::"AviatorRoundStatus", 'RUNNING'::"AviatorRoundStatus", 'CRASHED'::"AviatorRoundStatus")
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getOrCreateRound() {
  const existing = await getLatestActiveRound();
  if (existing) return existing;
  try {
    return await createRound();
  } catch (error) {
    // Another serverless invocation may have created the round concurrently.
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      const retry = await getLatestActiveRound();
      if (retry) return retry;
    }
    throw error;
  }
}

function toSnapshot(row: RoundRow, now: number, phase: AviatorRoundSnapshot["phase"], multiplier: number): AviatorRoundSnapshot {
  if (!row.serverSeedHash || !row.clientSeed || row.nonce === null || !row.algorithmVersion) {
    throw new Error("AVIATOR_FAIRNESS_DATA_MISSING");
  }
  return {
    roundId: row.id,
    phase,
    serverTime: now,
    multiplier,
    startedAt: row.startedAt?.getTime() ?? null,
    waitingEndsAt: phase === "WAITING" ? row.createdAt.getTime() + WAITING_MS : null,
    fairness: {
      roundId: row.id,
      serverSeedHash: row.serverSeedHash,
      clientSeed: row.clientSeed,
      nonce: row.nonce.toString(),
      algorithmVersion: row.algorithmVersion,
    },
  };
}

async function settleCrashIfNeeded(row: RoundRow, now: number, crashPoint: number) {
  const snapshot = toSnapshot(row, now, "CRASHED", crashPoint);
  await settleAviatorCrash(snapshot, crashPoint);
  await persistFinalizedAviatorRound(snapshot, crashPoint);
  return snapshot;
}

export async function getNetlifyAviatorRoundSnapshot(): Promise<AviatorRoundSnapshot> {
  let row = await getOrCreateRound();
  const now = Date.now();

  if (row.status === "CRASHED") {
    if (row.crashedAt && now - row.crashedAt.getTime() >= SETTLED_MS) {
      await prisma.aviatorRound.update({ where: { id: row.id }, data: { status: "SETTLED" } });
      row = await getOrCreateRound();
    } else {
      const crash = row.crashMultiplier ? Number(row.crashMultiplier) : 1.01;
      return toSnapshot(row, now, "CRASHED", crash);
    }
  }

  if (row.status === "WAITING") {
    const waitingEndsAt = row.createdAt.getTime() + WAITING_MS;
    if (now < waitingEndsAt) return toSnapshot(row, now, "WAITING", 1);

    const startedAt = new Date(waitingEndsAt);
    await prisma.aviatorRound.updateMany({
      where: { id: row.id, status: "WAITING" },
      data: { status: "RUNNING", startedAt },
    });
    row = (await getRound(row.id)) ?? row;
  }

  if (row.status === "RUNNING") {
    if (!row.serverSeedEncrypted || !row.clientSeed || row.nonce === null || !row.algorithmVersion) {
      throw new Error("AVIATOR_FAIRNESS_DATA_MISSING");
    }
    const serverSeed = decryptAviatorServerSeed(row.serverSeedEncrypted);
    const crashPoint = calculateAviatorCrashMultiplier({
      serverSeed,
      clientSeed: row.clientSeed,
      nonce: row.nonce.toString(),
      algorithmVersion: row.algorithmVersion,
    });
    const startedAt = row.startedAt ?? new Date(row.createdAt.getTime() + WAITING_MS);
    const multiplier = Math.max(1, multiplierAt(startedAt, now));

    if (multiplier >= crashPoint) {
      const claim = await prisma.aviatorRound.updateMany({
        where: { id: row.id, status: "RUNNING" },
        data: { status: "CRASHED", crashedAt: new Date(now), crashMultiplier: crashPoint },
      });
      if (claim.count === 1) {
        const crashedRow = (await getRound(row.id)) ?? row;
        return settleCrashIfNeeded(crashedRow, now, crashPoint);
      }
      const latest = await getRound(row.id);
      if (latest?.status === "CRASHED") return toSnapshot(latest, now, "CRASHED", crashPoint);
    }

    return toSnapshot(row, now, "RUNNING", multiplier);
  }

  // A settled row should never be returned as the live round. Start a new round.
  return getNetlifyAviatorRoundSnapshot();
}
