import "server-only";

import { Prisma, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { getCurrentUser, requireActiveUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addMoney, compareMoney, isValidUuid } from "@/lib/wallet-rules";
import {
  DAILY_WITHDRAWAL_LIMIT,
  MAX_WITHDRAWAL_AMOUNT,
  MIN_WITHDRAWAL_AMOUNT,
  WITHDRAWAL_CURRENCY,
  WITHDRAWAL_PAGE_SIZE,
  evaluateWithdrawalAmount,
  getAvailableWithdrawalBalance,
  validateWithdrawalAmount,
} from "@/lib/withdrawal-rules";

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_REJECTION_REASON_LENGTH = 1000;
const RESERVED_STATUSES = [WithdrawalRequestStatus.PENDING, WithdrawalRequestStatus.APPROVED] as const;

export type WithdrawalEligibility = {
  eligible: boolean;
  reason?: "USER_NOT_ACTIVE" | "WALLET_NOT_FOUND" | "AMOUNT_TOO_LOW" | "AMOUNT_TOO_HIGH" | "INVALID_AMOUNT" | "INSUFFICIENT_AVAILABLE_BALANCE" | "CURRENCY_MISMATCH" | "WITHDRAWAL_LIMIT_EXCEEDED";
  amount?: string;
  currency: string;
  walletBalance: string;
  reservedAmount: string;
  availableBalance: string;
  minimumAmount: string;
  maximumAmount: string | null;
  dailyLimit: string | null;
  dailyReservedAmount: string;
};

async function lockWallet(tx: Prisma.TransactionClient, walletId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; userId: string; currency: string; balance: string }>>(Prisma.sql`
    SELECT "id", "userId", "currency", "balance"::text AS "balance"
    FROM "Wallet"
    WHERE "id" = ${walletId}::uuid
    FOR UPDATE
  `);
  const wallet = rows[0];
  if (!wallet) throw new Error("WALLET_NOT_FOUND");
  return wallet;
}

async function getReservedAmount(tx: Prisma.TransactionClient, walletId: string) {
  const rows = await tx.$queryRaw<Array<{ amount: string }>>(Prisma.sql`
    SELECT COALESCE(SUM("amount"), 0)::text AS "amount"
    FROM "WithdrawalRequest"
    WHERE "walletId" = ${walletId}::uuid
      AND "status" IN ('PENDING', 'APPROVED')
  `);
  return rows[0]?.amount ?? "0.00";
}

async function getDailyReservedAmount(tx: Prisma.TransactionClient, walletId: string) {
  if (!DAILY_WITHDRAWAL_LIMIT) return "0.00";
  const rows = await tx.$queryRaw<Array<{ amount: string }>>(Prisma.sql`
    SELECT COALESCE(SUM("amount"), 0)::text AS "amount"
    FROM "WithdrawalRequest"
    WHERE "walletId" = ${walletId}::uuid
      AND "status" IN ('PENDING', 'APPROVED')
      AND "createdAt" >= CURRENT_DATE
  `);
  return rows[0]?.amount ?? "0.00";
}

function validateIdempotencyKey(value: string) {
  const key = value.trim();
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  return key;
}

function validateRejectionReason(value: string) {
  const reason = value.trim();
  if (!reason || reason.length > MAX_REJECTION_REASON_LENGTH) throw new Error("INVALID_REJECTION_REASON");
  return reason;
}

async function getEligibilityForWallet(
  tx: Prisma.TransactionClient,
  userId: string,
  walletId: string,
  amount: string,
): Promise<WithdrawalEligibility> {
  const wallet = await lockWallet(tx, walletId);
  if (wallet.userId !== userId) throw new Error("WALLET_OWNERSHIP_MISMATCH");

  const reservedAmount = await getReservedAmount(tx, walletId);
  const dailyReservedAmount = await getDailyReservedAmount(tx, walletId);
  const availableBalance = getAvailableWithdrawalBalance(wallet.balance, reservedAmount);

  if (wallet.currency !== WITHDRAWAL_CURRENCY) {
    return { eligible: false, reason: "CURRENCY_MISMATCH", currency: wallet.currency, walletBalance: wallet.balance, reservedAmount, availableBalance, minimumAmount: MIN_WITHDRAWAL_AMOUNT, maximumAmount: MAX_WITHDRAWAL_AMOUNT, dailyLimit: DAILY_WITHDRAWAL_LIMIT, dailyReservedAmount };
  }

  const evaluation = evaluateWithdrawalAmount(amount, availableBalance);
  if (!evaluation.eligible) {
    return { eligible: false, reason: evaluation.reason, currency: wallet.currency, walletBalance: wallet.balance, reservedAmount, availableBalance, minimumAmount: MIN_WITHDRAWAL_AMOUNT, maximumAmount: MAX_WITHDRAWAL_AMOUNT, dailyLimit: DAILY_WITHDRAWAL_LIMIT, dailyReservedAmount };
  }

  if (DAILY_WITHDRAWAL_LIMIT && compareMoney(addMoney(dailyReservedAmount, evaluation.amount), DAILY_WITHDRAWAL_LIMIT) > 0) {
    return { eligible: false, reason: "WITHDRAWAL_LIMIT_EXCEEDED", currency: wallet.currency, walletBalance: wallet.balance, reservedAmount, availableBalance, minimumAmount: MIN_WITHDRAWAL_AMOUNT, maximumAmount: MAX_WITHDRAWAL_AMOUNT, dailyLimit: DAILY_WITHDRAWAL_LIMIT, dailyReservedAmount };
  }

  return { eligible: true, amount: evaluation.amount, currency: wallet.currency, walletBalance: wallet.balance, reservedAmount, availableBalance, minimumAmount: MIN_WITHDRAWAL_AMOUNT, maximumAmount: MAX_WITHDRAWAL_AMOUNT, dailyLimit: DAILY_WITHDRAWAL_LIMIT, dailyReservedAmount };
}

export async function checkWithdrawalEligibility(amount: string, userId?: string): Promise<WithdrawalEligibility> {
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } }) : await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return { eligible: false, reason: "USER_NOT_ACTIVE", currency: WITHDRAWAL_CURRENCY, walletBalance: "0.00", reservedAmount: "0.00", availableBalance: "0.00", minimumAmount: MIN_WITHDRAWAL_AMOUNT, maximumAmount: MAX_WITHDRAWAL_AMOUNT, dailyLimit: DAILY_WITHDRAWAL_LIMIT, dailyReservedAmount: "0.00" };
  if (!isValidUuid(user.id)) throw new Error("INVALID_USER_ID");

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!wallet) return { eligible: false, reason: "WALLET_NOT_FOUND", currency: WITHDRAWAL_CURRENCY, walletBalance: "0.00", reservedAmount: "0.00", availableBalance: "0.00", minimumAmount: MIN_WITHDRAWAL_AMOUNT, maximumAmount: MAX_WITHDRAWAL_AMOUNT, dailyLimit: DAILY_WITHDRAWAL_LIMIT, dailyReservedAmount: "0.00" };

  return prisma.$transaction((tx) => getEligibilityForWallet(tx, user.id, wallet.id, amount), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getCurrentUserWithdrawalOverview() {
  const user = await requireActiveUser();
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id }, select: { id: true, currency: true, balance: true } });
  if (!wallet) return { wallet: null, reservedAmount: "0.00", availableBalance: "0.00", dailyReservedAmount: "0.00", minimumAmount: MIN_WITHDRAWAL_AMOUNT, maximumAmount: MAX_WITHDRAWAL_AMOUNT, dailyLimit: DAILY_WITHDRAWAL_LIMIT };
  const reserved = await prisma.withdrawalRequest.aggregate({ where: { walletId: wallet.id, status: { in: [...RESERVED_STATUSES] } }, _sum: { amount: true } });
  const reservedAmount = reserved._sum.amount?.toString() ?? "0.00";
  const availableBalance = getAvailableWithdrawalBalance(wallet.balance.toString(), reservedAmount);
  const daily = DAILY_WITHDRAWAL_LIMIT ? await prisma.withdrawalRequest.aggregate({ where: { walletId: wallet.id, status: { in: [...RESERVED_STATUSES] }, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, _sum: { amount: true } }) : null;
  return { wallet, reservedAmount, availableBalance, dailyReservedAmount: daily?._sum.amount?.toString() ?? "0.00", minimumAmount: MIN_WITHDRAWAL_AMOUNT, maximumAmount: MAX_WITHDRAWAL_AMOUNT, dailyLimit: DAILY_WITHDRAWAL_LIMIT };
}

export async function getCurrentUserWithdrawals(page = 1) {
  const user = await requireActiveUser();
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!wallet) return { items: [], page: safePage, total: 0, totalPages: 1 };
  const skip = (safePage - 1) * WITHDRAWAL_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({ where: { userId: user.id, walletId: wallet.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: WITHDRAWAL_PAGE_SIZE, select: { id: true, amount: true, currency: true, status: true, rejectionReason: true, createdAt: true, updatedAt: true, reviewedAt: true } }),
    prisma.withdrawalRequest.count({ where: { userId: user.id, walletId: wallet.id } }),
  ]);
  return { items, page: safePage, total, totalPages: Math.max(1, Math.ceil(total / WITHDRAWAL_PAGE_SIZE)) };
}

export async function createWithdrawalRequest(amountInput: string, idempotencyKeyInput: string) {
  const user = await requireActiveUser();
  const amount = validateWithdrawalAmount(amountInput);
  if (!amount) throw new Error("INVALID_AMOUNT");
  const idempotencyKey = validateIdempotencyKey(idempotencyKeyInput);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.withdrawalRequest.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } } });
    if (existing) {
      if (existing.amount.toString() !== amount) throw new Error("IDEMPOTENCY_KEY_REUSED");
      return { request: existing, idempotent: true };
    }

    const wallet = await tx.wallet.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!wallet) throw new Error("WALLET_NOT_FOUND");

    const eligibility = await getEligibilityForWallet(tx, user.id, wallet.id, amount);
    if (!eligibility.eligible) throw new Error(eligibility.reason);

    const request = await tx.withdrawalRequest.create({ data: { userId: user.id, walletId: wallet.id, amount: eligibility.amount!, currency: eligibility.currency, status: WithdrawalRequestStatus.PENDING, idempotencyKey } });
    return { request, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelWithdrawalRequest(withdrawalId: string) {
  const user = await requireActiveUser();
  if (!isValidUuid(withdrawalId)) throw new Error("WITHDRAWAL_NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!request || request.userId !== user.id) throw new Error("WITHDRAWAL_NOT_FOUND");
    if (request.status !== WithdrawalRequestStatus.PENDING) throw new Error("WITHDRAWAL_NOT_PENDING");
    await lockWallet(tx, request.walletId);
    return tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.CANCELLED }, select: { id: true, status: true, amount: true, currency: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function getAdminRequestOrThrow(tx: Prisma.TransactionClient, withdrawalId: string) {
  if (!isValidUuid(withdrawalId)) throw new Error("WITHDRAWAL_NOT_FOUND");
  const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, include: { user: { select: { id: true, name: true, email: true, status: true } }, wallet: { select: { id: true, userId: true, currency: true, balance: true } } } });
  if (!request) throw new Error("WITHDRAWAL_NOT_FOUND");
  return request;
}

export async function approveWithdrawalRequest(withdrawalId: string) {
  const admin = await requireAdmin();
  return prisma.$transaction(async (tx) => {
    const request = await getAdminRequestOrThrow(tx, withdrawalId);
    if (request.status !== WithdrawalRequestStatus.PENDING) throw new Error("WITHDRAWAL_NOT_PENDING");
    if (request.user.status !== "ACTIVE") throw new Error("USER_NOT_ACTIVE");
    const wallet = await lockWallet(tx, request.walletId);
    if (wallet.userId !== request.userId || wallet.currency !== request.currency) throw new Error("WITHDRAWAL_INTEGRITY_ERROR");

    const reservedWithoutThis = await tx.$queryRaw<Array<{ amount: string }>>(Prisma.sql`
      SELECT COALESCE(SUM("amount"), 0)::text AS "amount"
      FROM "WithdrawalRequest"
      WHERE "walletId" = ${request.walletId}::uuid
        AND "status" IN ('PENDING', 'APPROVED')
        AND "id" <> ${request.id}::uuid
    `);
    const otherReserved = reservedWithoutThis[0]?.amount ?? "0.00";
    const availableForRequest = getAvailableWithdrawalBalance(wallet.balance, otherReserved);
    if (compareMoney(request.amount.toString(), availableForRequest) > 0) throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");

    const updated = await tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.APPROVED, reviewedAt: new Date(), reviewedById: admin.id }, select: { id: true, status: true, amount: true, currency: true, reviewedAt: true, reviewedById: true } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectWithdrawalRequest(withdrawalId: string, reasonInput: string) {
  const admin = await requireAdmin();
  const reason = validateRejectionReason(reasonInput);
  return prisma.$transaction(async (tx) => {
    const request = await getAdminRequestOrThrow(tx, withdrawalId);
    if (request.status !== WithdrawalRequestStatus.PENDING) throw new Error("WITHDRAWAL_NOT_PENDING");
    await lockWallet(tx, request.walletId);
    return tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.REJECTED, rejectionReason: reason, reviewedAt: new Date(), reviewedById: admin.id }, select: { id: true, status: true, amount: true, currency: true, rejectionReason: true, reviewedAt: true, reviewedById: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getAdminWithdrawals(input: { page?: number; status?: WithdrawalRequestStatus }) {
  await requireAdmin();
  const safePage = Number.isSafeInteger(input.page) && input.page && input.page > 0 ? input.page : 1;
  const skip = (safePage - 1) * WITHDRAWAL_PAGE_SIZE;
  const where = input.status ? { status: input.status } : {};
  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: WITHDRAWAL_PAGE_SIZE, select: { id: true, amount: true, currency: true, status: true, rejectionReason: true, createdAt: true, reviewedAt: true, reviewedBy: { select: { name: true, email: true } }, user: { select: { id: true, name: true, email: true, status: true } }, wallet: { select: { id: true, currency: true, balance: true } } } }),
    prisma.withdrawalRequest.count({ where }),
  ]);
  return { items, page: safePage, total, totalPages: Math.max(1, Math.ceil(total / WITHDRAWAL_PAGE_SIZE)) };
}

export function formatWithdrawalError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    INVALID_AMOUNT: "Enter a valid positive amount with at most 2 decimals.",
    AMOUNT_TOO_LOW: `Minimum withdrawal is ₹${MIN_WITHDRAWAL_AMOUNT}.`,
    AMOUNT_TOO_HIGH: MAX_WITHDRAWAL_AMOUNT ? `Maximum withdrawal is ₹${MAX_WITHDRAWAL_AMOUNT}.` : "Amount exceeds the configured withdrawal limit.",
    INSUFFICIENT_AVAILABLE_BALANCE: "The requested amount exceeds your available withdrawal balance.",
    CURRENCY_MISMATCH: "Withdrawal currency does not match the wallet currency.",
    WITHDRAWAL_LIMIT_EXCEEDED: "The configured withdrawal limit has been exceeded.",
    WALLET_NOT_FOUND: "Wallet not found.",
    USER_NOT_ACTIVE: "Your account is not eligible for withdrawal operations.",
    INVALID_IDEMPOTENCY_KEY: "Invalid withdrawal request key. Please try again.",
    IDEMPOTENCY_KEY_REUSED: "This request key was already used with a different amount.",
    WITHDRAWAL_NOT_FOUND: "Withdrawal request not found.",
    WITHDRAWAL_NOT_PENDING: "Only pending withdrawal requests can be changed.",
    INVALID_REJECTION_REASON: "A rejection reason is required and must be 1000 characters or fewer.",
    WITHDRAWAL_INTEGRITY_ERROR: "Withdrawal financial records failed integrity validation.",
    WALLET_OWNERSHIP_MISMATCH: "Wallet ownership validation failed.",
  };
  return messages[code] ?? "The withdrawal operation could not be completed.";
}

export async function getCurrentUserWithdrawalHistory(page = 1) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return null;
  return getCurrentUserWithdrawals(page);
}
