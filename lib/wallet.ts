import "server-only";

import { Prisma, WalletTransactionType } from "@/app/generated/prisma/client";
import { getCurrentUser, requireActiveUser, requireAdmin } from "@/lib/auth";
import { addMoney, compareMoney, isPositiveMoney, isSupportedCurrency, isValidReferenceType, isValidTransactionCategory, isValidTransactionType, isValidUuid, normalizeMoney, WALLET_CURRENCY, WALLET_PAGE_SIZE, type WalletReferenceType, type WalletTransactionCategory as Category, type WalletTransactionType as Direction } from "@/lib/wallet-rules";

const MAX_REFERENCE_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 500;
const ZERO_CENTS = BigInt("0");
const HUNDRED_CENTS = BigInt("100");

function validateMoney(amount: string) {
  const normalized = normalizeMoney(amount);
  if (!normalized || !isPositiveMoney(normalized)) throw new Error("Amount must be a positive monetary value with at most 2 decimals.");
  return normalized;
}

function validateCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (!isSupportedCurrency(normalized)) throw new Error("Unsupported wallet currency.");
  return normalized;
}

function validateReference(referenceType: string, referenceId: string) {
  if (!isValidReferenceType(referenceType)) throw new Error("Invalid financial reference type.");
  if (!referenceId || referenceId.length > MAX_REFERENCE_LENGTH) throw new Error("Invalid financial reference.");
  if (["PRIZE_SETTLEMENT", "REFUND", "WITHDRAWAL", "ENTRY_PAYMENT", "ADJUSTMENT"].includes(referenceType) && !isValidUuid(referenceId)) throw new Error("Financial reference ID must be a UUID.");
}

function validateDescription(description: string | undefined) {
  const value = description?.trim() ?? "";
  if (value.length > MAX_DESCRIPTION_LENGTH) throw new Error("Description is too long.");
  return value || null;
}

export async function getOrCreateWalletForUser(userId: string) {
  if (!isValidUuid(userId)) throw new Error("Invalid user ID.");
  return prisma.wallet.upsert({ where: { userId }, create: { userId, currency: WALLET_CURRENCY, balance: "0.00" }, update: {}, select: { id: true, userId: true, currency: true, balance: true, createdAt: true, updatedAt: true } });
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
    prisma.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: WALLET_PAGE_SIZE, select: { id: true, type: true, category: true, amount: true, currency: true, description: true, createdAt: true, referenceType: true } }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
  ]);
  return { wallet, items, page: safePage, total, totalPages: Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE)) };
}

async function lockWallet(tx: Prisma.TransactionClient, walletId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; userId: string; currency: string; balance: string }>>(Prisma.sql`SELECT "id", "userId", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${walletId}::uuid FOR UPDATE`);
  const wallet = rows[0];
  if (!wallet) throw new Error("Wallet not found.");
  return wallet;
}

export async function recordWalletTransactionInTransaction(tx: Prisma.TransactionClient, input: { walletId: string; type: Direction; category: Category; amount: string; currency: string; referenceType: WalletReferenceType; referenceId: string; description?: string }) {
  if (!isValidUuid(input.walletId)) throw new Error("Invalid wallet ID.");
  const amount = validateMoney(input.amount);
  const currency = validateCurrency(input.currency);
  validateReference(input.referenceType, input.referenceId);
  if (!isValidTransactionType(input.type) || !isValidTransactionCategory(input.category)) throw new Error("Invalid wallet transaction type or category.");
  const description = validateDescription(input.description);

  const wallet = await lockWallet(tx, input.walletId);
  if (wallet.currency !== currency) throw new Error("Wallet currency mismatch.");

  const existing = await tx.walletTransaction.findFirst({ where: { walletId: input.walletId, referenceType: input.referenceType as never, referenceId: input.referenceId, type: input.type as never, category: input.category as never }, select: { id: true, walletId: true, type: true, category: true, amount: true, currency: true, referenceType: true, referenceId: true, description: true, createdAt: true } });
  if (existing) {
    if (existing.amount.toString() !== amount || existing.currency !== currency) throw new Error("Financial reference already exists with different transaction terms.");
    return existing;
  }

  const current = wallet.balance;
  const next = input.type === WalletTransactionType.CREDIT ? addMoney(current, amount) : compareMoney(current, amount) < 0 ? null : subtractMoneySafe(current, amount);
  if (next === null) throw new Error("Insufficient wallet balance.");

  const entry = await tx.walletTransaction.create({ data: { walletId: input.walletId, type: input.type, category: input.category as never, amount, currency, referenceType: input.referenceType as never, referenceId: input.referenceId, description }, select: { id: true, walletId: true, type: true, category: true, amount: true, currency: true, referenceType: true, referenceId: true, description: true, createdAt: true } });
  await tx.wallet.update({ where: { id: input.walletId }, data: { balance: next } });
  return entry;
}

async function recordWalletTransaction(input: { walletId: string; type: Direction; category: Category; amount: string; currency: string; referenceType: WalletReferenceType; referenceId: string; description?: string }) {
  return prisma.$transaction((tx) => recordWalletTransactionInTransaction(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function subtractMoneySafe(a: string, b: string) {
  const left = normalizeMoney(a)!;
  const right = normalizeMoney(b)!;
  const cents = BigInt(left.replace(".", "")) - BigInt(right.replace(".", ""));
  if (cents < ZERO_CENTS) throw new Error("Insufficient wallet balance.");
  return `${cents / HUNDRED_CENTS}.${(cents % HUNDRED_CENTS).toString().padStart(2, "0")}`;
}

export async function creditWallet(input: { walletId: string; amount: string; currency: string; referenceType: WalletReferenceType; referenceId: string; category: Category; description?: string }) {
  await requireAdmin();
  return recordWalletTransaction({ ...input, type: WalletTransactionType.CREDIT });
}

/** Server-only financial boundary for an already authenticated and PayU-verified deposit. */
export async function creditVerifiedDepositInTransaction(tx: Prisma.TransactionClient, input: { walletId: string; amount: string; currency: string; depositId: string; description?: string }) {
  if (!isValidUuid(input.depositId)) throw new Error("Invalid wallet deposit ID.");
  return recordWalletTransactionInTransaction(tx, { walletId: input.walletId, type: WalletTransactionType.CREDIT, category: "DEPOSIT" as Category, amount: input.amount, currency: input.currency, referenceType: "DEPOSIT", referenceId: input.depositId, description: input.description ?? `Wallet deposit ${input.depositId}` });
}

export async function debitWallet(input: { walletId: string; amount: string; currency: string; referenceType: WalletReferenceType; referenceId: string; category: Category; description?: string }) {
  await requireAdmin();
  return recordWalletTransaction({ ...input, type: WalletTransactionType.DEBIT });
}

export async function reconcileWallet(walletId: string) {
  await requireAdmin();
  if (!isValidUuid(walletId)) throw new Error("Invalid wallet ID.");
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, select: { id: true, userId: true, currency: true, balance: true } });
  if (!wallet) throw new Error("Wallet not found.");
  const rows = await prisma.walletTransaction.groupBy({ by: ["type"], where: { walletId }, _sum: { amount: true }, _count: { _all: true } });
  const credits = rows.find((r) => r.type === WalletTransactionType.CREDIT)?._sum.amount?.toString() ?? "0.00";
  const debits = rows.find((r) => r.type === WalletTransactionType.DEBIT)?._sum.amount?.toString() ?? "0.00";
  const expected = subtractMoneySafe(addMoney("0.00", credits), debits);
  const recorded = wallet.balance.toString();
  return { wallet, expectedBalance: expected, recordedBalance: recorded, difference: subtractSigned(recorded, expected), transactionCount: rows.reduce((sum, row) => sum + row._count._all, 0), status: compareMoney(expected, recorded) === 0 ? "CONSISTENT" as const : "MISMATCH" as const };
}

function subtractSigned(a: string, b: string) {
  const aa = BigInt(normalizeMoney(a)!.replace(".", ""));
  const bb = BigInt(normalizeMoney(b)!.replace(".", ""));
  const diff = aa - bb;
  const sign = diff < ZERO_CENTS ? "-" : "";
  const absolute = diff < ZERO_CENTS ? -diff : diff;
  return `${sign}${absolute / HUNDRED_CENTS}.${(absolute % HUNDRED_CENTS).toString().padStart(2, "0")}`;
}

export async function getAdminWallets(page = 1) {
  await requireAdmin();
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const skip = (safePage - 1) * WALLET_PAGE_SIZE;
  const [wallets, total] = await Promise.all([
    prisma.wallet.findMany({ orderBy: { createdAt: "desc" }, skip, take: WALLET_PAGE_SIZE, select: { id: true, userId: true, currency: true, balance: true, createdAt: true, user: { select: { name: true, email: true, status: true } } }),
    prisma.wallet.count(),
  ]);
  const reconciled = await Promise.all(wallets.map(async (wallet) => ({ ...wallet, reconciliation: await reconcileWallet(wallet.id) })));
  return { wallets: reconciled, page: safePage, total, totalPages: Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE)) };
}

export async function getAdminWalletTransactions(walletId: string, page = 1) {
  await requireAdmin();
  if (!isValidUuid(walletId)) throw new Error("Invalid wallet ID.");
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const skip = (safePage - 1) * WALLET_PAGE_SIZE;
  const [wallet, items, total] = await Promise.all([
    prisma.wallet.findUnique({ where: { id: walletId }, select: { id: true, userId: true, currency: true, balance: true, user: { select: { name: true, email: true, status: true } } }),
    prisma.walletTransaction.findMany({ where: { walletId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: WALLET_PAGE_SIZE, select: { id: true, type: true, category: true, amount: true, currency: true, referenceType: true, description: true, createdAt: true } }),
    prisma.walletTransaction.count({ where: { walletId } }),
  ]);
  if (!wallet) throw new Error("Wallet not found.");
  return { wallet, items, page: safePage, total, totalPages: Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE)), reconciliation: await reconcileWallet(walletId) };
}

export async function getCurrentUserWalletSummary() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return null;
  return getOrCreateWalletForUser(user.id);
}
