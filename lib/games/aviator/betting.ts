import { Prisma } from "@/app/generated/prisma/client";
import { type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeSecurityRateLimit } from "@/lib/security-rate-limit";
import { recordWalletTransactionInTransaction } from "@/lib/wallet";
import { compareMoney, isPositiveMoney, multiplyMoneyByMultiplier, normalizeMoney } from "@/lib/wallet-rules";
import { emitAviatorBetEvent } from "./betting-events";
import { getAviatorEngine } from "./server";
import type { AviatorRoundSnapshot } from "./types";

export const AVIATOR_BET_RESULT_CODES = {
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  INVALID_BET_AMOUNT: "INVALID_BET_AMOUNT",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  ROUND_NOT_ACCEPTING_BETS: "ROUND_NOT_ACCEPTING_BETS",
  ROUND_ALREADY_RUNNING: "ROUND_ALREADY_RUNNING",
  ROUND_ALREADY_CRASHED: "ROUND_ALREADY_CRASHED",
  BET_NOT_FOUND: "BET_NOT_FOUND",
  BET_NOT_ACTIVE: "BET_NOT_ACTIVE",
  BET_ALREADY_SETTLED: "BET_ALREADY_SETTLED",
  CASHOUT_TOO_LATE: "CASHOUT_TOO_LATE",
  DUPLICATE_REQUEST: "DUPLICATE_REQUEST",
  WALLET_TRANSACTION_FAILED: "WALLET_TRANSACTION_FAILED",
  INVALID_AUTO_CASHOUT: "INVALID_AUTO_CASHOUT",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

type ResultCode = typeof AVIATOR_BET_RESULT_CODES[keyof typeof AVIATOR_BET_RESULT_CODES];
type Result<T> = ({ ok: true } & T) | { ok: false; code: ResultCode; message: string };

const MIN_BET = "1.00";
const MAX_BET = "10000.00";
const MIN_AUTO = 1.01;
const MAX_AUTO = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ActiveBetRuntime = { userId: string; autoCashoutMultiplier: number | null; autoCashoutInFlight: boolean };
const activeBets = new Map<string, Map<string, ActiveBetRuntime>>();
let subscriptionsInstalled = false;

function message(code: ResultCode) {
  const messages: Record<ResultCode, string> = {
    AUTHENTICATION_REQUIRED: "Please sign in to place an Aviator bet.",
    INVALID_BET_AMOUNT: "Enter a valid bet amount.",
    INSUFFICIENT_BALANCE: "Insufficient wallet balance.",
    ROUND_NOT_ACCEPTING_BETS: "This round is not accepting bets.",
    ROUND_ALREADY_RUNNING: "The round is already running.",
    ROUND_ALREADY_CRASHED: "The round has already crashed.",
    BET_NOT_FOUND: "Bet not found.",
    BET_NOT_ACTIVE: "This bet is not active.",
    BET_ALREADY_SETTLED: "This bet has already been settled.",
    CASHOUT_TOO_LATE: "The round crashed before the cashout could be accepted.",
    DUPLICATE_REQUEST: "This request has already been processed.",
    WALLET_TRANSACTION_FAILED: "The wallet transaction could not be completed.",
    INVALID_AUTO_CASHOUT: "Auto cashout must be between 1.01x and 50.00x.",
    RATE_LIMITED: "Too many requests. Please wait a moment.",
  };
  return messages[code];
}

function validateAmount(value: unknown) {
  const normalized = normalizeMoney(typeof value === "number" ? String(value) : typeof value === "string" ? value : "");
  if (!normalized || !isPositiveMoney(normalized) || compareMoney(normalized, MIN_BET) < 0 || compareMoney(normalized, MAX_BET) > 0) return null;
  return normalized;
}

function validateAuto(value: unknown) {
  if (value === undefined || value === null || value === false || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < MIN_AUTO || n > MAX_AUTO) return "invalid" as const;
  return Number(n.toFixed(2));
}

async function ensureRoundRow(tx: Prisma.TransactionClient, snapshot: AviatorRoundSnapshot) {
  await tx.aviatorRound.upsert({
    where: { id: snapshot.roundId },
    create: { id: snapshot.roundId, status: snapshot.phase, startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : null },
    update: { status: snapshot.phase, startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : undefined },
  });
}

export function registerActiveBet(input: { roundId: string; betId: string; userId: string; autoCashoutMultiplier: number | null }) {
  let bets = activeBets.get(input.roundId);
  if (!bets) {
    bets = new Map();
    activeBets.set(input.roundId, bets);
  }
  bets.set(input.betId, { userId: input.userId, autoCashoutMultiplier: input.autoCashoutMultiplier, autoCashoutInFlight: false });
}

export function removeActiveBet(roundId: string, betId: string) {
  const bets = activeBets.get(roundId);
  if (!bets) return;
  bets.delete(betId);
  if (!bets.size) activeBets.delete(roundId);
}

function installRuntimeSubscriptions() {
  if (subscriptionsInstalled) return;
  subscriptionsInstalled = true;
  getAviatorEngine().subscribe((snapshot) => {
    if (snapshot.phase !== "RUNNING") return;
    const roundBets = activeBets.get(snapshot.roundId);
    if (!roundBets?.size) return;
    for (const [betId, runtime] of roundBets) {
      if (runtime.autoCashoutMultiplier && snapshot.multiplier >= runtime.autoCashoutMultiplier && !runtime.autoCashoutInFlight) {
        runtime.autoCashoutInFlight = true;
        void cashoutBetForUser(runtime.userId, betId, snapshot.roundId, true).finally(() => {
          const current = activeBets.get(snapshot.roundId)?.get(betId);
          if (current) current.autoCashoutInFlight = false;
        });
      }
    }
  });
}

export async function placeAviatorBetForUser(
  user: Pick<CurrentUser, "id" | "status">,
  input: { roundId: string; amount: unknown; clientRequestId: string; autoCashoutMultiplier?: unknown },
): Promise<Result<{ bet: { id: string; roundId: string; stake: string; status: string; serverTime: number; autoCashoutMultiplier: number | null }; walletBalance: string }>> {
  if (user.status !== "ACTIVE") return { ok: false, code: AVIATOR_BET_RESULT_CODES.AUTHENTICATION_REQUIRED, message: message(AVIATOR_BET_RESULT_CODES.AUTHENTICATION_REQUIRED) };
  if (!UUID.test(input.roundId) || !input.clientRequestId || input.clientRequestId.length > 128) return { ok: false, code: AVIATOR_BET_RESULT_CODES.INVALID_BET_AMOUNT, message: message(AVIATOR_BET_RESULT_CODES.INVALID_BET_AMOUNT) };
  const amount = validateAmount(input.amount);
  if (!amount) return { ok: false, code: AVIATOR_BET_RESULT_CODES.INVALID_BET_AMOUNT, message: message(AVIATOR_BET_RESULT_CODES.INVALID_BET_AMOUNT) };
  const auto = validateAuto(input.autoCashoutMultiplier);
  if (auto === "invalid") return { ok: false, code: AVIATOR_BET_RESULT_CODES.INVALID_AUTO_CASHOUT, message: message(AVIATOR_BET_RESULT_CODES.INVALID_AUTO_CASHOUT) };

  installRuntimeSubscriptions();
  const rate = await consumeSecurityRateLimit({ namespace: "aviator-bet", key: user.id, limit: 20, windowSeconds: 10 });
  if (!rate.allowed) return { ok: false, code: AVIATOR_BET_RESULT_CODES.RATE_LIMITED, message: message(AVIATOR_BET_RESULT_CODES.RATE_LIMITED) };

  return getAviatorEngine().withStateLock(async () => {
    const snapshot = getAviatorEngine().getSnapshot();
    if (snapshot.roundId !== input.roundId || snapshot.phase !== "WAITING") {
      const code = snapshot.phase === "RUNNING" ? AVIATOR_BET_RESULT_CODES.ROUND_ALREADY_RUNNING : snapshot.phase === "CRASHED" ? AVIATOR_BET_RESULT_CODES.ROUND_ALREADY_CRASHED : AVIATOR_BET_RESULT_CODES.ROUND_NOT_ACCEPTING_BETS;
      return { ok: false, code, message: message(code) };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.aviatorBet.findUnique({ where: { userId_clientRequestId: { userId: user.id, clientRequestId: input.clientRequestId } } });
        if (existing) {
          const existingAuto = existing.autoCashoutMultiplier ? Number(existing.autoCashoutMultiplier) : null;
          if (normalizeMoney(existing.stake.toString()) !== amount || existingAuto !== auto) throw new Error("DUPLICATE_REQUEST");
          const wallet = await tx.wallet.findUnique({ where: { userId: user.id }, select: { balance: true } });
          return { duplicate: true as const, bet: existing, walletBalance: wallet?.balance.toString() ?? "0.00" };
        }

        await ensureRoundRow(tx, snapshot);
        const wallet = await tx.wallet.findUnique({ where: { userId: user.id }, select: { id: true, balance: true, currency: true } });
        if (!wallet || wallet.currency !== "INR" || compareMoney(wallet.balance.toString(), amount) < 0) throw new Error("INSUFFICIENT_BALANCE");
        const bet = await tx.aviatorBet.create({ data: { roundId: snapshot.roundId, userId: user.id, stake: amount, status: "ACTIVE", clientRequestId: input.clientRequestId, autoCashoutMultiplier: auto } });
        await recordWalletTransactionInTransaction(tx, { walletId: wallet.id, type: "DEBIT", category: "AVIATOR_BET", amount, currency: "INR", referenceType: "AVIATOR_BET", referenceId: bet.id, description: `Aviator bet ${bet.id}` });
        const updatedWallet = await tx.wallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
        return { duplicate: false as const, bet, walletBalance: updatedWallet?.balance.toString() ?? "0.00" };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      registerActiveBet({ roundId: result.bet.roundId, betId: result.bet.id, userId: result.bet.userId, autoCashoutMultiplier: result.bet.autoCashoutMultiplier ? Number(result.bet.autoCashoutMultiplier) : null });
      if (!result.duplicate) emitAviatorBetEvent({ type: "bet:placed", roundId: result.bet.roundId, betId: result.bet.id, stake: result.bet.stake.toString(), status: "ACTIVE" });
      return { ok: true, bet: { id: result.bet.id, roundId: result.bet.roundId, stake: result.bet.stake.toString(), status: result.bet.status, serverTime: Date.now(), autoCashoutMultiplier: result.bet.autoCashoutMultiplier ? Number(result.bet.autoCashoutMultiplier) : null }, walletBalance: result.walletBalance };
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") return { ok: false, code: AVIATOR_BET_RESULT_CODES.INSUFFICIENT_BALANCE, message: message(AVIATOR_BET_RESULT_CODES.INSUFFICIENT_BALANCE) };
      if (error instanceof Error && error.message === "DUPLICATE_REQUEST") return { ok: false, code: AVIATOR_BET_RESULT_CODES.DUPLICATE_REQUEST, message: message(AVIATOR_BET_RESULT_CODES.DUPLICATE_REQUEST) };
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, code: AVIATOR_BET_RESULT_CODES.DUPLICATE_REQUEST, message: message(AVIATOR_BET_RESULT_CODES.DUPLICATE_REQUEST) };
      console.error("Aviator bet placement failed", error);
      return { ok: false, code: AVIATOR_BET_RESULT_CODES.WALLET_TRANSACTION_FAILED, message: message(AVIATOR_BET_RESULT_CODES.WALLET_TRANSACTION_FAILED) };
    }
  });
}

async function cashoutBetForUser(userId: string, betId: string, roundId: string, automatic = false) {
  if (!UUID.test(betId) || !UUID.test(roundId)) return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.BET_NOT_FOUND, message: message(AVIATOR_BET_RESULT_CODES.BET_NOT_FOUND) };
  const engine = getAviatorEngine();
  return engine.withStateLock(async () => {
    const snapshot = engine.getSnapshot();
    if (snapshot.roundId !== roundId || snapshot.phase !== "RUNNING") {
      const code = snapshot.phase === "CRASHED" ? AVIATOR_BET_RESULT_CODES.ROUND_ALREADY_CRASHED : AVIATOR_BET_RESULT_CODES.CASHOUT_TOO_LATE;
      return { ok: false as const, code, message: message(code) };
    }
    const multiplier = snapshot.multiplier;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const lockedRound = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`SELECT "id", "status" FROM "AviatorRound" WHERE "id" = ${roundId}::uuid FOR UPDATE`);
        if (!lockedRound[0]) return { kind: "invalid-round" as const };
        if (lockedRound[0].status === "CRASHED" || lockedRound[0].status === "SETTLED") return { kind: "late" as const };
        const bet = await tx.aviatorBet.findUnique({ where: { id: betId } });
        if (!bet || bet.userId !== userId || bet.roundId !== roundId) return { kind: "not-found" as const };
        if (bet.status !== "ACTIVE") return { kind: "settled" as const };
        const payout = multiplyMoneyByMultiplier(bet.stake.toString(), multiplier.toFixed(2));
        const updated = await tx.aviatorBet.updateMany({ where: { id: betId, status: "ACTIVE" }, data: { status: "CASHED_OUT", cashedOutAt: new Date(), cashoutMultiplier: multiplier, payout } });
        if (updated.count !== 1) return { kind: "settled" as const };
        const wallet = await tx.wallet.findUnique({ where: { userId }, select: { id: true } });
        if (!wallet) throw new Error("WALLET_TRANSACTION_FAILED");
        await recordWalletTransactionInTransaction(tx, { walletId: wallet.id, type: "CREDIT", category: "AVIATOR_BET", amount: payout, currency: "INR", referenceType: "AVIATOR_BET", referenceId: betId, description: `Aviator payout ${betId}` });
        return { kind: "success" as const, payout, multiplier };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (result.kind === "success") {
        removeActiveBet(roundId, betId);
        emitAviatorBetEvent({ type: "bet:cashout", roundId, betId, multiplier: result.multiplier, payout: result.payout, status: "CASHED_OUT" });
        return { ok: true as const, betId, roundId, multiplier: result.multiplier, payout: result.payout, status: "CASHED_OUT", automatic };
      }
      if (result.kind === "settled") return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.BET_ALREADY_SETTLED, message: message(AVIATOR_BET_RESULT_CODES.BET_ALREADY_SETTLED) };
      if (result.kind === "late") return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.CASHOUT_TOO_LATE, message: message(AVIATOR_BET_RESULT_CODES.CASHOUT_TOO_LATE) };
      return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.BET_NOT_FOUND, message: message(AVIATOR_BET_RESULT_CODES.BET_NOT_FOUND) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.BET_ALREADY_SETTLED, message: message(AVIATOR_BET_RESULT_CODES.BET_ALREADY_SETTLED) };
      if (error instanceof Error && error.message === "WALLET_TRANSACTION_FAILED") return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.WALLET_TRANSACTION_FAILED, message: message(AVIATOR_BET_RESULT_CODES.WALLET_TRANSACTION_FAILED) };
      console.error("Aviator cashout failed", error);
      return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.WALLET_TRANSACTION_FAILED, message: message(AVIATOR_BET_RESULT_CODES.WALLET_TRANSACTION_FAILED) };
    }
  });
}

export async function cashoutAviatorBetForUser(user: Pick<CurrentUser, "id" | "status">, betId: string, roundId: string) {
  if (user.status !== "ACTIVE") return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.AUTHENTICATION_REQUIRED, message: message(AVIATOR_BET_RESULT_CODES.AUTHENTICATION_REQUIRED) };
  const rate = await consumeSecurityRateLimit({ namespace: "aviator-cashout", key: user.id, limit: 30, windowSeconds: 10 });
  if (!rate.allowed) return { ok: false as const, code: AVIATOR_BET_RESULT_CODES.RATE_LIMITED, message: message(AVIATOR_BET_RESULT_CODES.RATE_LIMITED) };
  return cashoutBetForUser(user.id, betId, roundId);
}

export async function getCurrentUserAviatorBets(userId: string, roundId?: string) {
  return prisma.aviatorBet.findMany({
    where: { userId, ...(roundId && UUID.test(roundId) ? { roundId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getAviatorBetHistory(userId: string, page = 1, pageSize = 20) {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(50, Math.max(1, Math.floor(pageSize)));
  return prisma.aviatorBet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * safeSize,
    take: safeSize,
  });
}
