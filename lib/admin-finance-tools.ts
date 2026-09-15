import "server-only";

import crypto from "node:crypto";
import { Prisma, UserStatus, WalletDepositStatus, WalletReferenceType, WalletTransactionCategory, WalletTransactionType } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";
import { consumeSecurityRateLimit } from "@/lib/security-rate-limit";
import { compareMoney, isPositiveMoney, isValidUuid, normalizeMoney, WALLET_CURRENCY, WALLET_PAGE_SIZE } from "@/lib/wallet-rules";
import { recordWalletTransactionInTransaction } from "@/lib/wallet";

function cleanText(value: string, max: number) {
  const v = value.trim();
  if (!v || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new Error("INVALID_INPUT");
  return v;
}
function adjustmentReference(idempotencyKey: string) {
  const hex = crypto.createHash("sha256").update(`wallet-adjustment:${idempotencyKey}`, "utf8").digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export async function getAdminWalletDirectory(input: { page?: number; query?: string; status?: string }) {
  await requireAdmin();
  const page = Number.isSafeInteger(input.page) && (input.page ?? 1) > 0 ? input.page! : 1;
  const query = input.query?.trim().slice(0, 120) ?? "";
  const userWhere: Prisma.UserWhereInput = {};
  if (query) {
    const matches: Prisma.UserWhereInput[] = [{ email: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }, { phone: { contains: query, mode: "insensitive" } }];
    if (isValidUuid(query)) matches.unshift({ id: query });
    userWhere.OR = matches;
  }
  if (input.status && Object.values(UserStatus).includes(input.status as UserStatus)) userWhere.status = input.status as UserStatus;
  const where: Prisma.WalletWhereInput = Object.keys(userWhere).length ? { user: userWhere } : {};
  const skip = (page - 1) * WALLET_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.wallet.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: WALLET_PAGE_SIZE, select: { id: true, userId: true, currency: true, balance: true, createdAt: true, user: { select: { id: true, name: true, email: true, phone: true, status: true, role: true } } } }),
    prisma.wallet.count({ where }),
  ]);
  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE)) };
}

export async function getAdminTransactions(input: { page?: number; query?: string; type?: string; category?: string }) {
  await requireAdmin();
  const page = Number.isSafeInteger(input.page) && (input.page ?? 1) > 0 ? input.page! : 1;
  const query = input.query?.trim().slice(0, 120) ?? "";
  const where: Prisma.WalletTransactionWhereInput = {};
  if (input.type && Object.values(WalletTransactionType).includes(input.type as WalletTransactionType)) where.type = input.type as WalletTransactionType;
  if (input.category && Object.values(WalletTransactionCategory).includes(input.category as WalletTransactionCategory)) where.category = input.category as WalletTransactionCategory;
  if (query) {
    const ors: Prisma.WalletTransactionWhereInput[] = [{ referenceId: { contains: query, mode: "insensitive" } }, { wallet: { user: { email: { contains: query, mode: "insensitive" } } } }, { wallet: { user: { name: { contains: query, mode: "insensitive" } } } }];
    if (isValidUuid(query)) ors.unshift({ referenceId: query });
    where.OR = ors;
  }
  const skip = (page - 1) * WALLET_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: WALLET_PAGE_SIZE, select: { id: true, type: true, category: true, amount: true, currency: true, referenceType: true, referenceId: true, description: true, createdAt: true, wallet: { select: { id: true, user: { select: { id: true, name: true, email: true } } } } } }),
    prisma.walletTransaction.count({ where }),
  ]);
  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE)) };
}

export async function createAdminWalletAdjustment(input: { walletId: string; amount: string; direction: "CREDIT" | "DEBIT"; reason: string; idempotencyKey: string }) {
  const admin = await requireAdmin();
  if (!isValidUuid(input.walletId)) throw new Error("INVALID_WALLET");
  if (input.direction !== "CREDIT" && input.direction !== "DEBIT") throw new Error("INVALID_DIRECTION");
  const amount = normalizeMoney(input.amount);
  if (!amount || !isPositiveMoney(amount)) throw new Error("INVALID_AMOUNT");
  const reason = cleanText(input.reason, 1000);
  const key = cleanText(input.idempotencyKey, 128);
  const rate = await consumeSecurityRateLimit({ namespace: "admin-wallet-adjustment", key: admin.id, limit: 10, windowSeconds: 3600 });
  if (!rate.allowed) throw new Error("RATE_LIMITED");
  const referenceId = adjustmentReference(key);
  const result = await prisma.$transaction(async tx => {
    const wallet = await tx.wallet.findUnique({ where: { id: input.walletId }, select: { id: true, userId: true, currency: true, balance: true } });
    if (!wallet || wallet.currency !== WALLET_CURRENCY) throw new Error("WALLET_NOT_FOUND");
    const existing = await tx.walletTransaction.findFirst({ where: { walletId: wallet.id, referenceType: WalletReferenceType.ADJUSTMENT, referenceId, category: WalletTransactionCategory.ADJUSTMENT }, select: { id: true, type: true, amount: true, description: true } });
    if (existing) {
      if (normalizeMoney(existing.amount.toString()) !== amount || existing.type !== input.direction || existing.description !== reason) throw new Error("IDEMPOTENCY_KEY_REUSED");
      return { transaction: existing, idempotent: true };
    }
    if (input.direction === "DEBIT" && compareMoney(wallet.balance.toString(), amount) < 0) throw new Error("INSUFFICIENT_BALANCE");
    const transaction = await recordWalletTransactionInTransaction(tx, { walletId: wallet.id, type: input.direction, category: WalletTransactionCategory.ADJUSTMENT, amount, currency: wallet.currency, referenceType: WalletReferenceType.ADJUSTMENT, referenceId, description: reason });
    return { transaction, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!result.idempotent) await recordAdminAuditEvent({ action: "WALLET_ADJUSTMENT", targetType: "WALLET", targetId: input.walletId, metadata: { transactionId: result.transaction.id, amount, direction: input.direction, reason } });
  return result;
}

export async function getAdminAuditEvents(input: { page?: number; action?: string; targetType?: string; query?: string }) {
  await requireAdmin();
  const page = Number.isSafeInteger(input.page) && (input.page ?? 1) > 0 ? input.page! : 1;
  const where: Prisma.AdminAuditLogWhereInput = {};
  if (input.action?.trim()) where.action = { contains: input.action.trim().slice(0, 100), mode: "insensitive" };
  if (input.targetType?.trim()) where.targetType = input.targetType.trim().slice(0, 50);
  if (input.query?.trim()) { const q = input.query.trim().slice(0, 128); where.OR = [{ targetId: { contains: q, mode: "insensitive" } }, { actor: { email: { contains: q, mode: "insensitive" } } }]; }
  const skip = (page - 1) * WALLET_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.adminAuditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: WALLET_PAGE_SIZE, select: { id: true, actorUserId: true, action: true, targetType: true, targetId: true, metadataJson: true, createdAt: true, actor: { select: { name: true, email: true } } } }),
    prisma.adminAuditLog.count({ where }),
  ]);
  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE)) };
}

export async function getAdminDepositSummary() {
  await requireAdmin();
  const [pending, successful, failed, cancelled] = await Promise.all([prisma.walletDeposit.count({ where: { status: WalletDepositStatus.PENDING } }), prisma.walletDeposit.count({ where: { status: WalletDepositStatus.SUCCESS } }), prisma.walletDeposit.count({ where: { status: WalletDepositStatus.FAILED } }), prisma.walletDeposit.count({ where: { status: WalletDepositStatus.CANCELLED } })]);
  return { pending, successful, failed, cancelled };
}
