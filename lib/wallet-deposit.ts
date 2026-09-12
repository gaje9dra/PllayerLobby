import "server-only";

import crypto from "node:crypto";
import { Prisma, WalletDepositStatus } from "@/app/generated/prisma/client";
import { requireActiveUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeSecurityRateLimit } from "@/lib/security-rate-limit";
import { DEPOSIT_CURRENCY, DEPOSIT_MAX_AMOUNT, DEPOSIT_PAGE_SIZE, validateDepositAmount, validateDepositIdempotencyKey } from "@/lib/deposit-rules";
import { getOrCreateWalletForUser } from "@/lib/wallet";

const REFERENCE_ATTEMPTS = 5;
const REFERENCE_PATTERN = /^DEP-[A-Z0-9]{12}$/;

function generateDepositReference() {
  return `DEP-${crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "A").toUpperCase()}`;
}

function assertDepositReference(reference: string) {
  if (!REFERENCE_PATTERN.test(reference)) throw new Error("INVALID_DEPOSIT_REFERENCE");
  return reference;
}

function normalizeDepositError(error: unknown) {
  if (!(error instanceof Error)) return "We could not create the deposit. Please try again.";
  if (error.message === "INVALID_IDEMPOTENCY_KEY") return "This deposit request could not be identified safely. Please try again.";
  if (error.message === "IDEMPOTENCY_KEY_REUSED") return "This request key was already used for a different deposit amount.";
  if (error.message === "AMOUNT_TOO_LOW") return `Minimum deposit is ₹${DEPOSIT_MAX_AMOUNT === "0.00" ? "0.01" : "1.00"}.`;
  if (error.message === "AMOUNT_TOO_HIGH") return "The deposit amount is above the supported maximum.";
  if (error.message === "INVALID_AMOUNT") return "Enter a valid amount with at most 2 decimal places.";
  if (error.message === "DEPOSIT_NOT_PENDING") return "Only a pending deposit can be cancelled.";
  if (error.message === "DEPOSIT_NOT_FOUND") return "Deposit not found.";
  return "We could not complete that deposit request. Please try again.";
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function findDepositForUser(userId: string, id: string) {
  return prisma.walletDeposit.findFirst({
    where: { id, userId },
    select: {
      id: true,
      userId: true,
      walletId: true,
      amount: true,
      currency: true,
      status: true,
      reference: true,
      providerReference: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createWalletDeposit(amountInput: string, idempotencyKeyInput: string) {
  const user = await requireActiveUser();
  const idempotencyKey = validateDepositIdempotencyKey(idempotencyKeyInput);
  const evaluation = validateDepositAmount(amountInput);
  if (!evaluation.ok) throw new Error(evaluation.code);

  const wallet = await getOrCreateWalletForUser(user.id);
  if (wallet.currency !== DEPOSIT_CURRENCY) throw new Error("CURRENCY_MISMATCH");

  const rateLimit = await consumeSecurityRateLimit({ namespace: "wallet-deposit-create", key: user.id, limit: 5, windowSeconds: 60 });
  if (!rateLimit.allowed) throw new Error("DEPOSIT_RATE_LIMITED");

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    const reference = assertDepositReference(generateDepositReference());
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.walletDeposit.findUnique({
          where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
          select: { id: true, userId: true, walletId: true, amount: true, currency: true, status: true, reference: true, providerReference: true, createdAt: true, updatedAt: true },
        });
        if (existing) {
          if (existing.amount.toString() !== evaluation.amount || existing.currency !== DEPOSIT_CURRENCY) throw new Error("IDEMPOTENCY_KEY_REUSED");
          return { deposit: existing, idempotent: true };
        }

        const deposit = await tx.walletDeposit.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            amount: evaluation.amount,
            currency: DEPOSIT_CURRENCY,
            status: WalletDepositStatus.PENDING,
            reference,
            idempotencyKey,
          },
          select: { id: true, userId: true, walletId: true, amount: true, currency: true, status: true, reference: true, providerReference: true, createdAt: true, updatedAt: true },
        });
        return { deposit, idempotent: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        const existing = await prisma.walletDeposit.findUnique({
          where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
          select: { id: true, userId: true, walletId: true, amount: true, currency: true, status: true, reference: true, providerReference: true, createdAt: true, updatedAt: true },
        });
        if (existing) {
          if (existing.amount.toString() !== evaluation.amount || existing.currency !== DEPOSIT_CURRENCY) throw new Error("IDEMPOTENCY_KEY_REUSED");
          return { deposit: existing, idempotent: true };
        }
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < REFERENCE_ATTEMPTS - 1) continue;
      throw error;
    }
  }

  throw new Error("DEPOSIT_CREATE_FAILED");
}

export async function getCurrentUserDeposit(id: string) {
  const user = await requireActiveUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return findDepositForUser(user.id, id);
}

export async function cancelCurrentUserDeposit(id: string) {
  const user = await requireActiveUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("DEPOSIT_NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const deposit = await tx.walletDeposit.findFirst({ where: { id, userId: user.id }, select: { id: true, amount: true, status: true } });
    if (!deposit) throw new Error("DEPOSIT_NOT_FOUND");
    if (deposit.status !== WalletDepositStatus.PENDING) throw new Error("DEPOSIT_NOT_PENDING");
    return tx.walletDeposit.update({ where: { id: deposit.id }, data: { status: WalletDepositStatus.CANCELLED }, select: { id: true, amount: true, status: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getCurrentUserDeposits(page = 1) {
  const user = await requireActiveUser();
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const skip = (safePage - 1) * DEPOSIT_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.walletDeposit.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: DEPOSIT_PAGE_SIZE, select: { id: true, amount: true, currency: true, status: true, reference: true, providerReference: true, createdAt: true, updatedAt: true } }),
    prisma.walletDeposit.count({ where: { userId: user.id } }),
  ]);
  return { items, page: safePage, total, totalPages: Math.max(1, Math.ceil(total / DEPOSIT_PAGE_SIZE)) };
}

export async function getAdminDeposits(input: { page?: number; status?: WalletDepositStatus; reference?: string; minAmount?: string; maxAmount?: string }) {
  await requireAdmin();
  const safePage = Number.isSafeInteger(input.page) && (input.page ?? 1) > 0 ? input.page! : 1;
  const where: Prisma.WalletDepositWhereInput = {};
  if (input.status) where.status = input.status;
  if (input.reference?.trim()) where.reference = { contains: input.reference.trim(), mode: "insensitive" };
  if (input.minAmount || input.maxAmount) where.amount = { ...(input.minAmount ? { gte: input.minAmount } : {}), ...(input.maxAmount ? { lte: input.maxAmount } : {}) };
  const skip = (safePage - 1) * DEPOSIT_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.walletDeposit.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: DEPOSIT_PAGE_SIZE, select: { id: true, amount: true, currency: true, status: true, reference: true, providerReference: true, createdAt: true, updatedAt: true, user: { select: { name: true, email: true, status: true } }, wallet: { select: { balance: true, currency: true } } } }),
    prisma.walletDeposit.count({ where }),
  ]);
  return { items, page: safePage, total, totalPages: Math.max(1, Math.ceil(total / DEPOSIT_PAGE_SIZE)) };
}

export function formatDepositError(error: unknown) {
  if (error instanceof Error && error.message === "DEPOSIT_RATE_LIMITED") return "Too many deposit requests. Please wait and try again.";
  return normalizeDepositError(error);
}
