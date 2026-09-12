import "server-only";

import { Prisma, WalletTransactionType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireActiveUser, requireAdmin } from "@/lib/auth";
import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  isSupportedCurrency,
  isValidReferenceType,
  isValidTransactionCategory,
  isValidTransactionType,
  isValidUuid,
  normalizeMoney,
  WALLET_CURRENCY,
  WALLET_PAGE_SIZE,
  type WalletReferenceType,
  type WalletTransactionCategory as Category,
  type WalletTransactionType as Direction,
} from "@/lib/wallet-rules";

const MAX_REFERENCE_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 500;
const ZERO_CENTS = BigInt("0");
const HUNDRED_CENTS = BigInt("100");

function validateMoney(amount: string) {
  const normalized = normalizeMoney(amount);
  if (!normalized || !isPositiveMoney(normalized)) {
    throw new Error("Amount must be a positive monetary value with at most 2 decimals.");
  }
  return normalized;
}

function validateCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (!isSupportedCurrency(normalized)) throw new Error("Unsupported wallet currency.");
  return normalized;
}

function validateReference(referenceType: string, referenceId: string) {
  if (!isValidReferenceType(referenceType)) throw new Error("Invalid financial reference type.");
  if (!referenceId || referenceId.length > MAX_REFERENCE_LENGTH) {
    throw new Error("Invalid financial reference.");
  }
  if (
    ["PRIZE_SETTLEMENT", "REFUND", "WITHDRAWAL", "ENTRY_PAYMENT", "ADJUSTMENT"].includes(referenceType) &&
    !isValidUuid(referenceId)
  ) {
    throw new Error("Financial reference ID must be a UUID.");
  }
}

function validateDescription(description: string | undefined) {
  const value = description?.trim() ?? "";
  if (value.length > MAX_DESCRIPTION_LENGTH) throw new Error("Description is too long.");
  return value || null;
}

export async function getOrCreateWalletForUser(userId: string) {
  if (!isValidUuid(userId)) throw new Error("Invalid user ID.");
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId, currency: WALLET_CURRENCY, balance: "0.00" },
    update: {},
    select: { id: true, userId: true, currency: true, balance: true, createdAt: true, updatedAt: true },
  });
}

export async function getCurrentUserWallet() {
  const user = await requireActiveUser();
  return getOrCreateWalletForUser(user.id);
}

export async function getCurrentUserWalletTransactions(page = 1) {
  const user = await requireActiveUser();
  const wallet = await getOrCreateWalletForUser(user.id);
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const skip = (safePage - 1) * WALLET_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: WALLET_PAGE_SIZE,
      select: {
        id: true,
        type: true,
        category: true,
        amount: true,
        currency: true,
        description: true,
        createdAt: true,
        referenceType: true,
      },
    }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
  ]);
  return {
    wallet,
    items,
    page: safePage,
    total,
    totalPages: Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE)),
  };
}

async function lockWallet(tx: Prisma.TransactionClient, walletId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; userId: string; currency: string; balance: string }>>(
    Prisma.sql`SELECT "id", "userId", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${walletId}::uuid FOR UPDATE`,
  );
  const wallet = rows[0];
  if (!wallet) throw new Error("Wallet not found.");
  return wallet;
}

type WalletTransactionInput = {
  walletId: string;
  type: Direction;
  category: Category;
  amount: string;
  currency: string;
  referenceType: WalletReferenceType;
  referenceId: string;
  description?: string;
};

export async function recordWalletTransactionInTransaction(
  tx: Prisma.TransactionClient,
  input: WalletTransactionInput,
) {
  if (!isValidUuid(input.walletId)) throw new Error("Invalid wallet ID.");
  const amount = validateMoney(input.amount);
  const currency = validateCurrency(input.currency);
  validateReference(input.referenceType, input.referenceId);
  if (!isValidTransactionType(input.type) || !isValidTransactionCategory(input.category)) {
    throw new Error("Invalid wallet transaction type or category.");
  }
  const description = validateDescription(input.description);

  const wallet = await lockWallet(tx, input.walletId);
  if (wallet.currency !== currency) throw new Error("Wallet currency mismatch.");

  const existing = await tx.walletTransaction.findFirst({
    where: {
      walletId: input.walletId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      type: input.type,
      category: input.category,
    },
    select: {
      id: true,
      walletId: true,
      type: true,
      category: true,
      amount: true,
      currency: true,
      referenceType: true,
      referenceId: true,
      description: true,
      createdAt: true,
    },
  });

  if (existing) {
    if (existing.amount.toString() !== amount || existing.currency !== currency) {
      throw new Error("Financial reference already exists with different transaction terms.");
    }
    return existing;
  }

  const current = wallet.balance;
  let next: string;
  if (input.type === WalletTransactionType.CREDIT) {
    next = addMoney(current, amount);
  } else {
    if (compareMoney(current, amount) < 0) throw new Error("Insufficient wallet balance.");
    next = subtractMoneySafe(current, amount);
  }

  const entry = await tx.walletTransaction.create({
    data: {
      walletId: input.walletId,
      type: input.type,
      category: input.category,
      amount,
      currency,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description,
    },
    select: {
      id: true,
      walletId: true,
      type: true,
      category: true,
      amount: true,
      currency: true,
      referenceType: true,
      referenceId: true,
      description: true,
      createdAt: true,
    },
  });

  await tx.wallet.update({ where: { id: input.walletId }, data: { balance: next } });
  return entry;
}

async function recordWalletTransaction(input: Omit<WalletTransactionInput, "type"> & { type: Direction }) {
  return prisma.$transaction(
    (tx) => recordWalletTransactionInTransaction(tx, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function subtractMoneySafe(a: string, b: string) {
  const left = normalizeMoney(a)!;
  const right = normalizeMoney(b)!;
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const leftCents = BigInt(leftWhole) * HUNDRED_CENTS + BigInt((leftFraction + "00").slice(0, 2));
  const rightCents = BigInt(rightWhole) * HUNDRED_CENTS + BigInt((rightFraction + "00").slice(0, 2));
  const result = leftCents - rightCents;
  if (result < ZERO_CENTS) throw new Error("Insufficient wallet balance.");
  return `${result / HUNDRED_CENTS}.${(result % HUNDRED_CENTS).toString().padStart(2, "0")}`;
}

export async function creditWallet(input: Omit<WalletTransactionInput, "type">) {
  return recordWalletTransaction({ ...input, type: WalletTransactionType.CREDIT });
}

export async function debitWallet(input: Omit<WalletTransactionInput, "type">) {
  return recordWalletTransaction({ ...input, type: WalletTransactionType.DEBIT });
}

export async function getWalletTransactionsForAdmin(page = 1) {
  const user = await requireAdmin();
  void user;
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const skip = (safePage - 1) * WALLET_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: WALLET_PAGE_SIZE,
      select: {
        id: true,
        walletId: true,
        type: true,
        category: true,
        amount: true,
        currency: true,
        description: true,
        createdAt: true,
        referenceType: true,
        referenceId: true,
        wallet: { select: { userId: true } },
      },
    }),
    prisma.walletTransaction.count(),
  ]);
  return {
    items,
    page: safePage,
    total,
    totalPages: Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE)),
  };
}
