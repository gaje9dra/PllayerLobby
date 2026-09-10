import "server-only";

import crypto from "node:crypto";
import { Prisma, PayoutStatus, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { getPayUPayoutConfig } from "@/lib/payu-payout-client";
import { prisma } from "@/lib/prisma";
import { compareMoney } from "@/lib/wallet-rules";

const PROVIDER = "PAYU";

type Event = { event: string; merchantReferenceId?: string; payuRefId?: string; bankReferenceId?: string; payoutMerchantId?: string; msg?: string; authorization?: string };

function safeMessage(value: unknown) { return String(value ?? "PayU transfer failed").replace(/[\r\n]+/g, " ").slice(0, 1000); }
function fingerprint(event: Event) { return crypto.createHash("sha256").update(JSON.stringify({ event: event.event, merchantReferenceId: event.merchantReferenceId ?? null, payuRefId: event.payuRefId ?? null, bankReferenceId: event.bankReferenceId ?? null, payoutMerchantId: event.payoutMerchantId ?? null })).digest("hex"); }

export async function processPayUPayoutWebhook(event: Event) {
  const config = getPayUPayoutConfig();
  if (event.authorization !== config.webhookSecret) throw new Error("INVALID_WEBHOOK_AUTHORIZATION");
  if (event.payoutMerchantId !== config.merchantId) throw new Error("INVALID_PAYOUT_MERCHANT_ID");
  if (!event.merchantReferenceId) throw new Error("MISSING_MERCHANT_REFERENCE");
  const eventFingerprint = fingerprint(event);

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.payoutWebhookEvent.findUnique({ where: { fingerprint: eventFingerprint }, select: { id: true } });
    if (duplicate) return { duplicate: true as const };

    const payout = await tx.payout.findUnique({ where: { merchantTransferId: event.merchantReferenceId! }, select: { id: true, withdrawalRequestId: true, status: true, amount: true, currency: true } });
    if (!payout) {
      await tx.payoutWebhookEvent.create({ data: { provider: PROVIDER, eventType: event.event, merchantTransferId: event.merchantReferenceId, providerReference: event.payuRefId || event.bankReferenceId || null, fingerprint: eventFingerprint } });
      return { unknown: true as const };
    }

    await tx.payoutWebhookEvent.create({ data: { provider: PROVIDER, eventType: event.event, merchantTransferId: event.merchantReferenceId, providerReference: event.payuRefId || event.bankReferenceId || null, fingerprint: eventFingerprint, payoutId: payout.id } });

    if (event.event === "REQUEST_PROCESSING_FAILED") return { recorded: true as const, action: "RECONCILIATION_REQUIRED" as const };

    if (event.event === "TRANSFER_SUCCESS") {
      if (payout.status === PayoutStatus.PAID) return { recorded: true as const, action: "ALREADY_PAID" as const };
      if (payout.status === PayoutStatus.FAILED || payout.status === PayoutStatus.REVERSED) return { recorded: true as const, action: "CRITICAL_MISMATCH" as const };
      const request = await tx.withdrawalRequest.findUnique({ where: { id: payout.withdrawalRequestId }, select: { id: true, walletId: true, amount: true, currency: true, status: true } });
      if (!request || request.currency !== payout.currency || compareMoney(request.amount.toString(), payout.amount.toString()) !== 0) throw new Error("PAYOUT_AMOUNT_MISMATCH");
      if (([WithdrawalRequestStatus.FAILED, WithdrawalRequestStatus.REVERSED, WithdrawalRequestStatus.PAID] as WithdrawalRequestStatus[]).includes(request.status)) return { recorded: true as const, action: "CRITICAL_MISMATCH" as const };
      const walletRows = await tx.$queryRaw<Array<{ id: string; currency: string; balance: string }>>(Prisma.sql`SELECT "id", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${request.walletId}::uuid FOR UPDATE`);
      const wallet = walletRows[0];
      if (!wallet || wallet.currency !== request.currency) throw new Error("WALLET_INTEGRITY_ERROR");
      if (compareMoney(wallet.balance, payout.amount.toString()) < 0) throw new Error("INSUFFICIENT_WALLET_BALANCE");
      const existing = await tx.walletTransaction.findFirst({ where: { walletId: request.walletId, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, type: "DEBIT", category: "WITHDRAWAL" }, select: { id: true, amount: true, currency: true } });
      if (!existing) {
        const cents = BigInt(wallet.balance.replace(".", "")) - BigInt(payout.amount.toString().replace(".", ""));
        const next = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
        await tx.walletTransaction.create({ data: { walletId: request.walletId, type: "DEBIT", category: "WITHDRAWAL", amount: payout.amount, currency: request.currency, referenceType: "WITHDRAWAL_PAYOUT", referenceId: payout.id, description: "Successful PayU payout" } });
        await tx.wallet.update({ where: { id: request.walletId }, data: { balance: next } });
      } else if (existing.amount.toString() !== payout.amount.toString() || existing.currency !== payout.currency) throw new Error("PAYOUT_LEDGER_TERM_MISMATCH");
      await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PAID, providerTransferId: event.payuRefId || undefined, providerReference: event.bankReferenceId || event.payuRefId || undefined, completedAt: new Date() } });
      await tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: WithdrawalRequestStatus.PAID } });
      return { recorded: true as const, action: "PAID" as const };
    }

    if (event.event === "TRANSFER_FAILED") {
      if (payout.status === PayoutStatus.PAID) return { recorded: true as const, action: "CRITICAL_MISMATCH" as const };
      if (payout.status === PayoutStatus.REVERSED) return { recorded: true as const, action: "CRITICAL_MISMATCH" as const };
      await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.FAILED, providerTransferId: event.payuRefId || undefined, providerReference: event.payuRefId || undefined, failureCode: "PAYU_TRANSFER_FAILED", failureReason: safeMessage(event.msg) } });
      await tx.withdrawalRequest.update({ where: { id: payout.withdrawalRequestId }, data: { status: WithdrawalRequestStatus.FAILED, rejectionReason: safeMessage(event.msg) } });
      return { recorded: true as const, action: "FAILED" as const };
    }

    if (event.event === "TRANSFER_REVERSED") {
      if (payout.status === PayoutStatus.REVERSED) return { recorded: true as const, action: "ALREADY_REVERSED" as const };
      if (payout.status === PayoutStatus.FAILED) return { recorded: true as const, action: "CRITICAL_MISMATCH" as const };
      await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.REVERSED, providerTransferId: event.payuRefId || undefined, providerReference: event.bankReferenceId || event.payuRefId || undefined } });
      await tx.withdrawalRequest.update({ where: { id: payout.withdrawalRequestId }, data: { status: WithdrawalRequestStatus.REVERSED } });
      return { recorded: true as const, action: "REVERSED" as const };
    }

    return { recorded: true as const, action: "IGNORED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
