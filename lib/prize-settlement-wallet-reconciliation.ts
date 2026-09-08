import "server-only";

import { TournamentPrizeSettlementStatus, WalletTransactionCategory, WalletTransactionType } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compareMoney, isSupportedCurrency } from "@/lib/wallet-rules";

export async function reconcilePrizeSettlementWallets(tournamentId: string) {
  await requireAdmin();
  const settlements = await prisma.tournamentPrizeSettlement.findMany({
    where: { tournamentId },
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      registrationId: true,
      registration: { select: { userId: true } },
    },
  });

  const errors: string[] = [];
  const approvedWithoutCredit: string[] = [];
  const creditedWithoutMatchingCredit: string[] = [];

  for (const settlement of settlements) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: settlement.registration.userId }, select: { id: true, currency: true } });
    const credit = wallet
      ? await prisma.walletTransaction.findFirst({
          where: { walletId: wallet.id, referenceType: "PRIZE_SETTLEMENT", referenceId: settlement.id, type: WalletTransactionType.CREDIT, category: WalletTransactionCategory.PRIZE },
          select: { id: true, amount: true, currency: true },
        })
      : null;

    if (settlement.status === TournamentPrizeSettlementStatus.APPROVED && !credit) {
      approvedWithoutCredit.push(settlement.id);
    }

    if (settlement.status === TournamentPrizeSettlementStatus.CREDITED) {
      if (!credit) {
        creditedWithoutMatchingCredit.push(settlement.id);
        errors.push(`${settlement.id}: CREDITED settlement has no matching wallet credit.`);
        continue;
      }
      if (!wallet || wallet.currency !== settlement.currency || !isSupportedCurrency(settlement.currency)) errors.push(`${settlement.id}: credited wallet currency mismatch.`);
      if (compareMoney(credit.amount.toString(), settlement.amount.toString()) !== 0) errors.push(`${settlement.id}: wallet credit amount does not match settlement amount.`);
      if (credit.currency !== settlement.currency) errors.push(`${settlement.id}: wallet credit currency does not match settlement currency.`);
    }

    if (credit && settlement.status !== TournamentPrizeSettlementStatus.CREDITED) {
      errors.push(`${settlement.id}: wallet credit exists but settlement is not CREDITED.`);
    }
  }

  return {
    ok: errors.length === 0 && approvedWithoutCredit.length === 0,
    errors,
    warnings: approvedWithoutCredit.map((id) => `${id}: APPROVED settlement has no wallet credit.`),
    approvedWithoutCredit,
    creditedWithoutMatchingCredit,
  };
}
