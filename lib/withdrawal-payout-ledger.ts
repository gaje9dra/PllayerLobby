import "server-only";

import { Prisma, WalletTransactionCategory, WalletTransactionType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { compareMoney, isValidUuid, normalizeMoney } from "@/lib/wallet-rules";

const HUNDRED = BigInt(100);

function subtract(a: string, b: string) {
  const cents = BigInt(normalizeMoney(a)!.replace(".", "")) - BigInt(normalizeMoney(b)!.replace(".", ""));
  if (cents < 0n) throw new Error("INSUFFICIENT_WALLET_BALANCE");
  return `${cents / HUNDRED}.${(cents % HUNDRED).toString().padStart(2, "0")}`;
}

export async function recordSuccessfulWithdrawalDebit(input: { walletId: string; amount: string; currency: string; payoutId: string }) {
  if (!isValidUuid(input.walletId) || !isValidUuid(input.payoutId)) throw new Error("INVALID_PAYOUT_REFERENCE");
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; currency: string; balance: string }>>(Prisma.sql`SELECT "id", "currency", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${input.walletId}::uuid FOR UPDATE`);
    const wallet = rows[0];
    if (!wallet) throw new Error("WALLET_NOT_FOUND");
    if (wallet.currency !== input.currency) throw new Error("CURRENCY_MISMATCH");
    const existing = await tx.walletTransaction.findFirst({ where: { walletId: input.walletId, referenceType: "WITHDRAWAL_PAYOUT", referenceId: input.payoutId, type: WalletTransactionType.DEBIT, category: WalletTransactionCategory.WITHDRAWAL }, select: { id: true, amount: true, currency: true } });
    if (existing) {
      if (existing.amount.toString() !== input.amount || existing.currency !== input.currency) throw new Error("PAYOUT_LEDGER_TERM_MISMATCH");
      return existing;
    }
    if (compareMoney(wallet.balance.toString(), input.amount) < 0) throw new Error("INSUFFICIENT_WALLET_BALANCE");
    const entry = await tx.walletTransaction.create({ data: { walletId: input.walletId, type: WalletTransactionType.DEBIT, category: WalletTransactionCategory.WITHDRAWAL, amount: input.amount, currency: input.currency, referenceType: "WITHDRAWAL_PAYOUT", referenceId: input.payoutId, description: "Successful PayU payout" }, select: { id: true, amount: true, currency: true } });
    await tx.wallet.update({ where: { id: input.walletId }, data: { balance: subtract(wallet.balance.toString(), input.amount) } });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
