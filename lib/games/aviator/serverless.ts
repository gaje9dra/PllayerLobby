import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptAviatorServerSeed, encryptAviatorServerSeed } from "./secret";
import { calculateAviatorCrashMultiplier, createAviatorFairnessRound, AVIATOR_FAIRNESS_ALGORITHM_VERSION } from "./provably-fair";
import { emitAviatorBetEvent } from "./betting-events";
import type { AviatorRoundSnapshot } from "./types";

const WAITING_MS = 5_000;
const CRASH_DISPLAY_MS = 1_800;
// A transaction-scoped PostgreSQL advisory lock serializes every round lifecycle
// mutation across Netlify instances and concurrent API requests.
const ROUND_LIFECYCLE_LOCK = 4_817_263_901n;

type Db = Prisma.TransactionClient;
type RoundRow = {
  id: string;
  status: "WAITING" | "RUNNING" | "CRASHED" | "SETTLED";
  startedAt: Date | null;
  crashedAt: Date | null;
  crashMultiplier: string | null;
  createdAt: Date;
  serverNow: Date;
  serverSeedEncrypted: string | null;
  serverSeedHash: string | null;
  clientSeed: string | null;
  nonce: bigint | null;
  algorithmVersion: string | null;
};

function waitingEndsAt(row: RoundRow) {
  return row.createdAt.getTime() + WAITING_MS;
}

function multiplierAt(startedAt: Date, now: number) {
  const elapsed = Math.max(0, now - startedAt.getTime()) / 1000;
  return Number(Math.exp(elapsed * 0.12).toFixed(2));
}

function randomNonce() {
  return (BigInt(Date.now()) * 1_000_000n + (BigInt(`0x${randomBytes(4).toString("hex")}`) % 1_000_000n)).toString();
}

async function getRound(tx: Db, id: string) {
  const rows = await tx.$queryRaw<RoundRow[]>\`
    SELECT
      "id", "status", "startedAt", "crashedAt", "crashMultiplier", "createdAt",
      "serverSeedEncrypted", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion",
      clock_timestamp() AS "serverNow"
    FROM "AviatorRound"
    WHERE "id" = ${id}::uuid
    LIMIT 1
  \`;
  return rows[0] ?? null;
}

async function getLatestActiveRound(tx: Db) {
  const rows = await tx.$queryRaw<RoundRow[]>\`
    SELECT
      "id", "status", "startedAt", "crashedAt", "crashMultiplier", "createdAt",
      "serverSeedEncrypted", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion",
      clock_timestamp() AS "serverNow"
    FROM "AviatorRound"
    WHERE "status" IN ('WAITING'::"AviatorRoundStatus", 'RUNNING'::"AviatorRoundStatus", 'CRASHED'::"AviatorRoundStatus")
    ORDER BY "createdAt" DESC
    LIMIT 1
  \`;
  return rows[0] ?? null;
}

async function createRound(tx: Db) {
  const id = randomUUID();
  const fairness = createAviatorFairnessRound(id);
  const encryptedSeed = encryptAviatorServerSeed(fairness.serverSeed);
  await tx.$executeRaw\`
    INSERT INTO "AviatorRound" (
      "id", "status", "serverSeedEncrypted", "serverSeedHash", "clientSeed", "nonce", "algorithmVersion"
    ) VALUES (
      ${id}::uuid, 'WAITING'::"AviatorRoundStatus", ${encryptedSeed}, ${fairness.serverSeedHash},
      ${fairness.clientSeed}, ${BigInt(randomNonce())}, ${fairness.algorithmVersion}
    )
  \`;
  const row = await getRound(tx, id);
  if (!row) throw new Error("AVIATOR_ROUND_CREATE_FAILED");
  return row;
}

function toSnapshot(row: RoundRow, now: number, phase: AviatorRoundSnapshot["phase"], multiplier: number): AviatorRoundSnapshot {
  if (!row.serverSeedHash || !row.clientSeed || row.nonce === null || !row.algorithmVersion) throw new Error("AVIATOR_FAIRNESS_DATA_MISSING");
  if (row.algorithmVersion !== AVIATOR_FAIRNESS_ALGORITHM_VERSION) throw new Error("UNSUPPORTED_ALGORITHM_VERSION");
  return {
    roundId: row.id,
    phase,
    serverTime: now,
    multiplier,
    startedAt: row.startedAt?.getTime() ?? null,
    waitingEndsAt: phase === "WAITING" ? waitingEndsAt(row) : null,
    fairness: {
      roundId: row.id,
      serverSeedHash: row.serverSeedHash,
      clientSeed: row.clientSeed,
      nonce: row.nonce.toString(),
      algorithmVersion: AVIATOR_FAIRNESS_ALGORITHM_VERSION,
    },
  };
}

async function settleCrashedRound(tx: Db, row: RoundRow) {
  const now = row.serverNow;
  const crashPoint = Number(row.crashMultiplier ?? "1.01");
  const activeBets = await tx.aviatorBet.findMany({
    where: { roundId: row.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (activeBets.length) {
    await tx.aviatorBet.updateMany({
      where: { roundId: row.id, status: "ACTIVE" },
      data: { status: "LOST", updatedAt: now },
    });
  }

  // One guarded transition settles the round and publishes its fairness reveal.
  // It is safe to retry: only CRASHED rows can transition and active bets are
  // changed with a status predicate in this same transaction.
  const finalized = await tx.aviatorRound.updateMany({
    where: { id: row.id, status: "CRASHED" },
    data: {
      status: "SETTLED",
      crashedAt: row.crashedAt ?? now,
      crashMultiplier: crashPoint,
      fairnessRevealedAt: now,
    },
  });
  if (finalized.count !== 1) throw new Error("AVIATOR_ROUND_SETTLEMENT_CONFLICT");
  return activeBets.map((bet) => bet.id);
}

async function withLifecycleLock<T>(work: (tx: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw\`SELECT pg_advisory_xact_lock(${ROUND_LIFECYCLE_LOCK})\`;
    return work(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 20_000 });
}

export async function getNetlifyAviatorRoundSnapshot(): Promise<AviatorRoundSnapshot> {
  const result = await withLifecycleLock(async (tx) => {
    let row = await getLatestActiveRound(tx);
    if (!row) row = await createRound(tx);
    let now = row.serverNow.getTime();

    if (row.status === "CRASHED") {
      const crashPoint = Number(row.crashMultiplier ?? "1.01");
      const crashedAt = row.crashedAt?.getTime() ?? now;
      // Keep CRASHED observable long enough for clients to render the crash
      // frame before settling and opening the next betting window.
      if (now - crashedAt < CRASH_DISPLAY_MS) {
        return { snapshot: toSnapshot(row, now, "CRASHED", crashPoint), lostBetIds: [] as string[] };
      }
      const lostBetIds = await settleCrashedRound(tx, row);
      const next = await createRound(tx);
      return { snapshot: toSnapshot(next, next.serverNow.getTime(), "WAITING", 1), lostBetIds };
    }

    if (row.status === "WAITING") {
      const deadline = waitingEndsAt(row);
      if (now < deadline) return { snapshot: toSnapshot(row, now, "WAITING", 1), lostBetIds: [] as string[] };
      await tx.aviatorRound.updateMany({
        where: { id: row.id, status: "WAITING" },
        data: { status: "RUNNING", startedAt: new Date(deadline) },
      });
      row = (await getRound(tx, row.id)) ?? row;
      now = row.serverNow.getTime();
    }

    if (row.status === "RUNNING") {
      if (!row.serverSeedEncrypted || !row.clientSeed || row.nonce === null || !row.algorithmVersion) throw new Error("AVIATOR_FAIRNESS_DATA_MISSING");
      if (row.algorithmVersion !== AVIATOR_FAIRNESS_ALGORITHM_VERSION) throw new Error("UNSUPPORTED_ALGORITHM_VERSION");
      const serverSeed = decryptAviatorServerSeed(row.serverSeedEncrypted);
      const crashPoint = calculateAviatorCrashMultiplier({
        serverSeed,
        clientSeed: row.clientSeed,
        nonce: row.nonce.toString(),
        algorithmVersion: AVIATOR_FAIRNESS_ALGORITHM_VERSION,
      });
      const startedAt = row.startedAt ?? new Date(waitingEndsAt(row));
      const multiplier = Math.max(1, multiplierAt(startedAt, now));
      if (multiplier >= crashPoint) {
        const claim = await tx.aviatorRound.updateMany({
          where: { id: row.id, status: "RUNNING" },
          data: { status: "CRASHED", crashedAt: row.serverNow, crashMultiplier: crashPoint },
        });
        if (claim.count === 1) {
          const crashedRow = (await getRound(tx, row.id)) ?? row;
          return { snapshot: toSnapshot(crashedRow, now, "CRASHED", crashPoint), lostBetIds: [] as string[] };
        }
        const latest = await getRound(tx, row.id);
        if (latest?.status === "CRASHED") {
          return { snapshot: toSnapshot(latest, now, Number(latest.crashMultiplier ?? crashPoint)), lostBetIds: [] as string[] };
        }
      }
      return { snapshot: toSnapshot(row, now, "RUNNING", multiplier), lostBetIds: [] as string[] };
    }

    throw new Error(`AVIATOR_UNEXPECTED_ROUND_STATE:${row.status}`);
  });

  for (const betId of result.lostBetIds) {
    emitAviatorBetEvent({ type: "bet:lost", roundId: result.snapshot.roundId, betId, status: "LOST" });
  }
  return result.snapshot;
}

/** Admin-triggered bust uses the exact same lifecycle lock and CRASHED state as
 * automatic crashes. Settlement/next-round creation is left to the normal
 * lifecycle worker after the crash display window. */
export async function bustNetlifyAviatorRoundNow() {
  return withLifecycleLock(async (tx) => {
    const row = await getLatestActiveRound(tx);
    if (!row || row.status !== "RUNNING") return { ok: false as const, code: "ROUND_NOT_RUNNING" as const };
    if (!row.startedAt || !row.serverSeedEncrypted || !row.clientSeed || row.nonce === null || !row.algorithmVersion) {
      throw new Error("AVIATOR_FAIRNESS_DATA_MISSING");
    }
    const now = row.serverNow.getTime();
    const serverSeed = decryptAviatorServerSeed(row.serverSeedEncrypted);
    const scheduledCrash = calculateAviatorCrashMultiplier({
      serverSeed,
      clientSeed: row.clientSeed,
      nonce: row.nonce.toString(),
      algorithmVersion: AVIATOR_FAIRNESS_ALGORITHM_VERSION,
    });
    const liveMultiplier = Math.max(1, multiplierAt(row.startedAt, now));
    const crashPoint = Math.min(liveMultiplier, scheduledCrash);
    const claim = await tx.aviatorRound.updateMany({
      where: { id: row.id, status: "RUNNING" },
      data: { status: "CRASHED", crashedAt: row.serverNow, crashMultiplier: crashPoint },
    });
    if (claim.count !== 1) return { ok: false as const, code: "ROUND_ALREADY_ENDED" as const };
    return {
      ok: true as const,
      snapshot: toSnapshot({ ...row, status: "CRASHED", crashedAt: row.serverNow, crashMultiplier: String(crashPoint) }, now, "CRASHED", crashPoint),
    };
  });
}
