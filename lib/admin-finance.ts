import "server-only";

import { PaymentStatus, TournamentPrizeSettlementStatus, WalletDepositStatus, WalletTransactionCategory, WalletTransactionType } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function money(value: unknown) {
  return Number(value ?? 0).toFixed(2);
}

export async function getAdminFinanceOverview() {
  await requireAdmin();

  const [walletCount, walletBalance, successfulDeposits, entryDebits, prizeCredits, pendingPayments, failedPayments, pendingDeposits, pendingSettlements, walletBalances, ledgerTotals, recentTransactions] = await Promise.all([
    prisma.wallet.count(),
    prisma.wallet.aggregate({ _sum: { balance: true } }),
    prisma.walletDeposit.aggregate({ where: { status: WalletDepositStatus.SUCCESS }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.walletTransaction.aggregate({ where: { type: WalletTransactionType.DEBIT, category: WalletTransactionCategory.ENTRY_FEE }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.walletTransaction.aggregate({ where: { type: WalletTransactionType.CREDIT, category: WalletTransactionCategory.PRIZE }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.count({ where: { status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING] } } }),
    prisma.payment.count({ where: { status: { in: [PaymentStatus.FAILED, PaymentStatus.CANCELLED] } } }),
    prisma.walletDeposit.count({ where: { status: WalletDepositStatus.PENDING } }),
    prisma.tournamentPrizeSettlement.count({ where: { status: { in: [TournamentPrizeSettlementStatus.PENDING, TournamentPrizeSettlementStatus.APPROVED] } } }),
    prisma.wallet.findMany({ select: { id: true, balance: true } }),
    prisma.walletTransaction.groupBy({ by: ["walletId", "type"], _sum: { amount: true } }),
    prisma.walletTransaction.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { id: true, type: true, category: true, amount: true, currency: true, referenceType: true, referenceId: true, createdAt: true, wallet: { select: { user: { select: { id: true, name: true, email: true } } } } } }),
  ]);

  const totalsByWallet = new Map<string, { credit: number; debit: number }>();
  for (const row of ledgerTotals) {
    const current = totalsByWallet.get(row.walletId) ?? { credit: 0, debit: 0 };
    current[row.type === WalletTransactionType.CREDIT ? "credit" : "debit"] = Number(row._sum.amount ?? 0);
    totalsByWallet.set(row.walletId, current);
  }

  let reconciliationIssues = 0;
  for (const wallet of walletBalances) {
    const totals = totalsByWallet.get(wallet.id) ?? { credit: 0, debit: 0 };
    if (Math.abs(Number(wallet.balance) - (totals.credit - totals.debit)) > 0.005) reconciliationIssues += 1;
  }

  return {
    walletUsers: walletCount,
    totalWalletBalance: money(walletBalance._sum.balance),
    successfulDeposits: money(successfulDeposits._sum.amount),
    successfulDepositCount: successfulDeposits._count._all,
    tournamentEntryDebits: money(entryDebits._sum.amount),
    tournamentEntryCount: entryDebits._count._all,
    prizeWinnings: money(prizeCredits._sum.amount),
    prizeWinningCount: prizeCredits._count._all,
    pendingPayments,
    failedPayments,
    reconciliationIssues,
    unresolvedCases: pendingDeposits + pendingSettlements + reconciliationIssues,
    pendingDeposits,
    pendingSettlements,
    recentTransactions,
  };
}
