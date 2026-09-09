import "server-only";

import { Prisma, PayoutDestinationStatus, PayoutDestinationType, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { requireActiveUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptPayoutData, encryptPayoutData } from "@/lib/payout-crypto";
import { compareMoney } from "@/lib/wallet-rules";
import { evaluateWithdrawalAmount, getAvailableWithdrawalBalance, validateWithdrawalAmount, WITHDRAWAL_CURRENCY } from "@/lib/withdrawal-rules";

const RESERVED_STATUSES = [WithdrawalRequestStatus.PENDING, WithdrawalRequestStatus.APPROVED] as const;

async function lockWallet(tx: Prisma.TransactionClient, walletId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; userId: string; currency: string; balance: string }>>(Prisma.sql`
    SELECT "id", "userId", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${walletId}::uuid FOR UPDATE
  `);
  if (!rows[0]) throw new Error("WALLET_NOT_FOUND");
  return rows[0];
}

async function getReserved(tx: Prisma.TransactionClient, walletId: string) {
  const rows = await tx.$queryRaw<Array<{ amount: string }>>(Prisma.sql`
    SELECT COALESCE(SUM("amount"), 0)::text AS "amount" FROM "WithdrawalRequest" WHERE "walletId" = ${walletId}::uuid AND "status" IN ('PENDING','APPROVED')
  `);
  return rows[0]?.amount ?? "0.00";
}

function validateSnapshot(data: unknown, type: PayoutDestinationType) {
  if (!data || typeof data !== "object" || (data as { version?: unknown }).version !== 1 || (data as { type?: unknown }).type !== type) throw new Error("DESTINATION_DATA_CORRUPTED");
}

export async function createWithdrawalRequestWithDestination(amountInput: string, idempotencyKeyInput: string, destinationIdInput: string) {
  const user = await requireActiveUser();
  const amount = validateWithdrawalAmount(amountInput);
  if (!amount) throw new Error("INVALID_AMOUNT");
  const idempotencyKey = idempotencyKeyInput.trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (!destinationIdInput || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(destinationIdInput)) throw new Error("DESTINATION_NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.withdrawalRequest.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } } });
    if (existing) {
      if (existing.amount.toString() !== amount || existing.payoutDestinationId !== destinationIdInput) throw new Error("IDEMPOTENCY_KEY_REUSED");
      return { request: existing, idempotent: true };
    }

    const walletRecord = await tx.wallet.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!walletRecord) throw new Error("WALLET_NOT_FOUND");
    const wallet = await lockWallet(tx, walletRecord.id);
    if (wallet.userId !== user.id || wallet.currency !== WITHDRAWAL_CURRENCY) throw new Error("CURRENCY_MISMATCH");

    const destination = await tx.payoutDestination.findUnique({ where: { id: destinationIdInput }, select: { id: true, userId: true, type: true, status: true, maskedDestination: true, encryptedDestinationData: true } });
    if (!destination || destination.userId !== user.id) throw new Error("DESTINATION_NOT_FOUND");
    if (destination.status === PayoutDestinationStatus.DISABLED) throw new Error("DESTINATION_DISABLED");

    let data: unknown;
    try { data = JSON.parse(decryptPayoutData(destination.encryptedDestinationData)); } catch { throw new Error("DESTINATION_DATA_CORRUPTED"); }
    validateSnapshot(data, destination.type);

    const reserved = await getReserved(tx, wallet.id);
    const available = getAvailableWithdrawalBalance(wallet.balance, reserved);
    const evaluation = evaluateWithdrawalAmount(amount, available);
    if (!evaluation.eligible) throw new Error(evaluation.reason);

    const encryptedSnapshot = encryptPayoutData(JSON.stringify(data));
    const request = await tx.withdrawalRequest.create({ data: { userId: user.id, walletId: wallet.id, payoutDestinationId: destination.id, destinationTypeSnapshot: destination.type, destinationMaskedSnapshot: destination.maskedDestination, encryptedDestinationSnapshot: encryptedSnapshot, amount: evaluation.amount!, currency: WITHDRAWAL_CURRENCY, status: WithdrawalRequestStatus.PENDING, idempotencyKey } });
    return { request, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveWithdrawalRequestWithDestination(withdrawalId: string) {
  const admin = await requireAdmin();
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { id: true, userId: true, walletId: true, payoutDestinationId: true, destinationTypeSnapshot: true, destinationMaskedSnapshot: true, encryptedDestinationSnapshot: true, amount: true, currency: true, status: true } });
    if (!request) throw new Error("WITHDRAWAL_NOT_FOUND");
    if (request.status !== WithdrawalRequestStatus.PENDING) throw new Error("WITHDRAWAL_NOT_PENDING");
    const user = await tx.user.findUnique({ where: { id: request.userId }, select: { id: true, status: true } });
    if (!user || user.status !== "ACTIVE") throw new Error("USER_NOT_ACTIVE");
    if (!request.payoutDestinationId || !request.destinationTypeSnapshot || !request.destinationMaskedSnapshot || !request.encryptedDestinationSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");

    const wallet = await lockWallet(tx, request.walletId);
    if (wallet.userId !== request.userId || wallet.currency !== request.currency) throw new Error("WITHDRAWAL_INTEGRITY_ERROR");
    const destination = await tx.payoutDestination.findUnique({ where: { id: request.payoutDestinationId }, select: { id: true, userId: true, type: true, status: true, maskedDestination: true, encryptedDestinationData: true } });
    if (!destination || destination.userId !== request.userId) throw new Error("DESTINATION_OWNERSHIP_MISMATCH");
    if (destination.status !== PayoutDestinationStatus.VERIFIED) throw new Error("DESTINATION_NOT_VERIFIED");
    if (destination.type !== request.destinationTypeSnapshot || destination.maskedDestination !== request.destinationMaskedSnapshot) throw new Error("DESTINATION_SNAPSHOT_MISMATCH");
    try { const snapshot = JSON.parse(decryptPayoutData(request.encryptedDestinationSnapshot)); validateSnapshot(snapshot, request.destinationTypeSnapshot); } catch { throw new Error("DESTINATION_DATA_CORRUPTED"); }
    const reservedRows = await tx.$queryRaw<Array<{ amount: string }>>(Prisma.sql`
      SELECT COALESCE(SUM("amount"), 0)::text AS "amount" FROM "WithdrawalRequest"
      WHERE "walletId" = ${request.walletId}::uuid AND "status" IN ('PENDING','APPROVED') AND "id" <> ${request.id}::uuid
    `);
    const available = getAvailableWithdrawalBalance(wallet.balance, reservedRows[0]?.amount ?? "0.00");
    if (compareMoney(request.amount.toString(), available) > 0) throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");
    return tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.APPROVED, reviewedAt: new Date(), reviewedById: admin.id }, select: { id: true, status: true, amount: true, currency: true, payoutDestinationId: true, destinationTypeSnapshot: true, destinationMaskedSnapshot: true, reviewedAt: true, reviewedById: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getAdminWithdrawalsWithDestination(input: { page?: number; status?: WithdrawalRequestStatus }) {
  await requireAdmin();
  const page = Number.isSafeInteger(input.page) && input.page && input.page > 0 ? input.page : 1;
  const take = 20;
  const where = input.status ? { status: input.status } : {};
  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take, select: { id: true, amount: true, currency: true, status: true, payoutDestinationId: true, destinationTypeSnapshot: true, destinationMaskedSnapshot: true, rejectionReason: true, createdAt: true, reviewedAt: true, reviewedBy: { select: { name: true, email: true } }, user: { select: { id: true, name: true, email: true, status: true } }, payoutDestination: { select: { id: true, type: true, status: true, maskedDestination: true, userId: true } } } }),
    prisma.withdrawalRequest.count({ where }),
  ]);
  return { items, page, total, totalPages: Math.max(1, Math.ceil(total / take)) };
}

export async function reconcileWithdrawalDestinations() {
  await requireAdmin();
  const requests = await prisma.withdrawalRequest.findMany({ select: { id: true, userId: true, payoutDestinationId: true, destinationTypeSnapshot: true, destinationMaskedSnapshot: true, encryptedDestinationSnapshot: true, status: true } });
  const errors: string[] = [];
  for (const request of requests) {
    if (!request.payoutDestinationId || !request.destinationTypeSnapshot || !request.destinationMaskedSnapshot || !request.encryptedDestinationSnapshot) { errors.push(`${request.id}: missing payout destination snapshot.`); continue; }
    const destination = await prisma.payoutDestination.findUnique({ where: { id: request.payoutDestinationId }, select: { userId: true, type: true, status: true, maskedDestination: true } });
    if (!destination) { errors.push(`${request.id}: payout destination is missing.`); continue; }
    if (destination.userId !== request.userId) errors.push(`${request.id}: payout destination belongs to another user.`);
    if (destination.type !== request.destinationTypeSnapshot || destination.maskedDestination !== request.destinationMaskedSnapshot) errors.push(`${request.id}: destination snapshot metadata mismatch.`);
    if (request.status === WithdrawalRequestStatus.APPROVED && destination.status !== PayoutDestinationStatus.VERIFIED) errors.push(`${request.id}: approved withdrawal has a destination that is not verified.`);
    try { const snapshot = JSON.parse(decryptPayoutData(request.encryptedDestinationSnapshot)); validateSnapshot(snapshot, request.destinationTypeSnapshot); } catch { errors.push(`${request.id}: encrypted destination snapshot is corrupted.`); }
  }
  return { ok: errors.length === 0, errors };
}
