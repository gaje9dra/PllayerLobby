import "server-only";

import crypto from "node:crypto";
import { Prisma, PayoutPaymentType, PayoutReconciliationStatus, PayoutStatus, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subtractMoney, compareMoney } from "@/lib/wallet-rules";
import { assertPayoutTransition } from "@/lib/payout-state";

const MAX_REFERENCE_LENGTH = 128;

function normalizeReference(value: string) {
  const reference = value.trim();
  if (reference.length < 4 || reference.length > MAX_REFERENCE_LENGTH || !/^[A-Za-z0-9][A-Za-z0-9 ._:/-]*$/.test(reference)) {
    throw new Error("INVALID_MANUAL_PAYMENT_REFERENCE");
  }
  return reference;
}

function newManualReference() {
  return `MANUAL-${crypto.randomBytes(12).toString("hex")}`.slice(0, 40);
}

/**
 * Records a manual bank/UPI transfer only after an admin has sent the money.
 * The wallet debit, payout record, and withdrawal status change commit atomically.
 */
export async function markWithdrawalManuallyPaid(withdrawalId: string, referenceInput: string) {
  const admin = await requireAdmin();
  const manualReference = normalizeReference(referenceInput);

  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
      select: { id: true, userId: true, walletId: true, amount: true, currency: true, status: true, destinationTypeSnapshot: true },
    });
    if (!request) throw new Error("WITHDRAWAL_NOT_FOUND");
    if (request.status !== WithdrawalRequestStatus.APPROVED) throw new Error("WITHDRAWAL_NOT_APPROVED");
    if (!request.destinationTypeSnapshot) throw new Error("MISSING_DESTINATION_SNAPSHOT");
    if (request.currency !== "INR") throw new Error("CURRENCY_MISMATCH");
    if (await tx.payout.count({ where: { withdrawalRequestId: request.id } })) throw new Error("PAYOUT_ALREADY_EXISTS");

    const rows = await tx.$queryRaw<Array<{ id: string; userId: string; currency: string; balance: string }>>(
      Prisma.sql`SELECT "id", "userId", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${request.walletId}::uuid FOR UPDATE`,
    );
    const wallet = rows[0];
    if (!wallet || wallet.userId !== request.userId || wallet.currency !== request.currency) throw new Error("WALLET_INTEGRITY_ERROR");
    if (compareMoney(wallet.balance, request.amount.toString()) < 0) throw new Error("INSUFFICIENT_WALLET_BALANCE");

    const payoutId = crypto.randomUUID();
    const now = new Date();
    const payout = await tx.payout.create({
      data: {
        id: payoutId,
        withdrawalRequestId: request.id,
        provider: "MANUAL",
        merchantTransferId: newManualReference(),
        providerReference: manualReference,
        amount: request.amount,
        currency: request.currency,
        paymentType: request.destinationTypeSnapshot === "UPI" ? PayoutPaymentType.UPI : PayoutPaymentType.IMPS,
        status: PayoutStatus.PAYOUT_INITIATED,
        reconciliationStatus: PayoutReconciliationStatus.NOT_CHECKED,
        initiatedAt: now,
      },
    });

    assertPayoutTransition(payout.status, PayoutStatus.PROCESSING);
    await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PROCESSING } });

    await tx.walletTransaction.create({
      data: {
        walletId: request.walletId,
        type: "DEBIT",
        category: "WITHDRAWAL",
        amount: request.amount,
        currency: request.currency,
        referenceType: "WITHDRAWAL_PAYOUT",
        referenceId: payout.id,
        description: `Manual withdrawal payout · ${manualReference}`,
      },
    });
    await tx.wallet.update({
      where: { id: request.walletId },
      data: { balance: subtractMoney(wallet.balance, request.amount.toString()) },
    });

    assertPayoutTransition(PayoutStatus.PROCESSING, PayoutStatus.PAID);
    await tx.payout.update({
      where: { id: payout.id },
      data: { status: PayoutStatus.PAID, completedAt: now, reconciliationStatus: PayoutReconciliationStatus.MATCHED, reconciliationMessage: "Marked paid by an administrator after manual bank/UPI transfer.", lastReconciledAt: now },
    });
    await tx.withdrawalRequest.update({
      where: { id: request.id },
      data: { status: WithdrawalRequestStatus.PAID, reviewedAt: now, reviewedById: admin.id },
    });

    return { id: payout.id, amount: request.amount, currency: request.currency, reference: manualReference };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function formatManualPayoutError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    INVALID_MANUAL_PAYMENT_REFERENCE: "Enter a valid bank/UPI transaction reference (4–128 characters).",
    WITHDRAWAL_NOT_FOUND: "Withdrawal request not found.",
    WITHDRAWAL_NOT_APPROVED: "Approve this withdrawal before recording a manual payment.",
    MISSING_DESTINATION_SNAPSHOT: "This request has no saved payout destination.",
    CURRENCY_MISMATCH: "This withdrawal uses an unsupported currency.",
    PAYOUT_ALREADY_EXISTS: "A payout record already exists for this withdrawal. Review it before taking action.",
    WALLET_INTEGRITY_ERROR: "Wallet ownership or currency validation failed.",
    INSUFFICIENT_WALLET_BALANCE: "Wallet balance is insufficient to settle this withdrawal.",
  };
  return messages[code] ?? "The manual payout could not be recorded. No wallet balance was changed.";
}
