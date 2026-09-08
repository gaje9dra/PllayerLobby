import "server-only";

import {
  Prisma,
  RegistrationStatus,
  TournamentPrizeSettlementStatus,
  TournamentPrizeStatus,
  TournamentResultStatus,
  TournamentStatus,
  WalletTransactionCategory,
  WalletTransactionType,
} from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addMoney, compareMoney, isPositiveMoney, isSupportedCurrency, normalizeMoney } from "@/lib/wallet-rules";
import { SETTLEMENT_CURRENCY } from "@/lib/tournament-prize-settlement-rules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ZERO_CENTS = BigInt("0");
const HUNDRED_CENTS = BigInt("100");

export const PRIZE_SETTLEMENT_WALLET_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED", SETTLEMENT_NOT_FOUND: "SETTLEMENT_NOT_FOUND", SETTLEMENT_NOT_APPROVED: "SETTLEMENT_NOT_APPROVED", SETTLEMENT_ALREADY_CREDITED: "SETTLEMENT_ALREADY_CREDITED", TOURNAMENT_NOT_COMPLETED: "TOURNAMENT_NOT_COMPLETED", PRIZE_NOT_FINALIZED: "PRIZE_NOT_FINALIZED", RESULT_NOT_VERIFIED: "RESULT_NOT_VERIFIED", REGISTRATION_NOT_CONFIRMED: "REGISTRATION_NOT_CONFIRMED", WALLET_NOT_FOUND: "WALLET_NOT_FOUND", CURRENCY_MISMATCH: "CURRENCY_MISMATCH", INVALID_AMOUNT: "INVALID_AMOUNT", DUPLICATE_CREDIT: "DUPLICATE_CREDIT", FINANCIAL_RECONCILIATION_FAILED: "FINANCIAL_RECONCILIATION_FAILED", INTEGRITY_ERROR: "INTEGRITY_ERROR",
} as const;
export type PrizeSettlementWalletErrorCode = typeof PRIZE_SETTLEMENT_WALLET_ERROR_CODES[keyof typeof PRIZE_SETTLEMENT_WALLET_ERROR_CODES];
export class PrizeSettlementWalletError extends Error { readonly code: PrizeSettlementWalletErrorCode; constructor(code: PrizeSettlementWalletErrorCode, message: string) { super(message); this.name = "PrizeSettlementWalletError"; this.code = code; } }

const assertUuid = (value: string) => { if (!UUID.test(value)) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.SETTLEMENT_NOT_FOUND, "Prize settlement not found."); };
function positiveMoney(value: string) { const normalized = normalizeMoney(value); if (!normalized || !isPositiveMoney(normalized)) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.INVALID_AMOUNT, "Settlement amount is invalid."); return normalized; }
function subtractMoneySafe(a: string, b: string) { const left = normalizeMoney(a); const right = normalizeMoney(b); if (!left || !right) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.INVALID_AMOUNT, "Wallet balance is invalid."); const cents = BigInt(left.replace(".", "")) - BigInt(right.replace(".", "")); if (cents < ZERO_CENTS) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.FINANCIAL_RECONCILIATION_FAILED, "Wallet balance cannot become negative."); return `${cents / HUNDRED_CENTS}.${(cents % HUNDRED_CENTS).toString().padStart(2, "0")}`; }
async function lockSettlement(tx: Prisma.TransactionClient, settlementId: string) { const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "TournamentPrizeSettlement" WHERE "id" = ${settlementId}::uuid FOR UPDATE`); if (!rows[0]) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.SETTLEMENT_NOT_FOUND, "Prize settlement not found."); }

export async function creditApprovedPrizeSettlement(settlementId: string) {
  try { await requireAdmin(); } catch { throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.UNAUTHORIZED, "Only an active admin can credit a prize settlement."); }
  assertUuid(settlementId);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockSettlement(tx, settlementId);
      const settlement = await tx.tournamentPrizeSettlement.findUnique({ where: { id: settlementId }, select: { id: true, tournamentId: true, prizeId: true, registrationId: true, resultId: true, rank: true, amount: true, currency: true, status: true, tournament: { select: { id: true, name: true, status: true } }, prize: { select: { id: true, rank: true, amount: true, status: true } }, registration: { select: { id: true, userId: true, status: true, tournamentId: true, user: { select: { id: true, name: true, email: true, status: true } } } }, result: { select: { id: true, rank: true, resultStatus: true, tournamentId: true, registrationId: true } } } });
      if (!settlement) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.SETTLEMENT_NOT_FOUND, "Prize settlement not found.");
      if (settlement.status === TournamentPrizeSettlementStatus.CREDITED) {
        const wallet = await tx.wallet.findUnique({ where: { userId: settlement.registration.userId }, select: { id: true, userId: true, currency: true, balance: true } });
        if (!wallet) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.FINANCIAL_RECONCILIATION_FAILED, "Settlement is marked CREDITED but the winner wallet is missing.");
        const credit = await tx.walletTransaction.findFirst({ where: { walletId: wallet.id, referenceType: "PRIZE_SETTLEMENT", referenceId: settlement.id, type: WalletTransactionType.CREDIT, category: WalletTransactionCategory.PRIZE }, select: { id: true, amount: true, currency: true, createdAt: true } });
        if (!credit || compareMoney(credit.amount.toString(), settlement.amount.toString()) !== 0 || credit.currency !== settlement.currency || wallet.currency !== settlement.currency) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.FINANCIAL_RECONCILIATION_FAILED, "Settlement is marked CREDITED but its wallet credit does not match the settlement.");
        return { settlement: { id: settlement.id, status: settlement.status, amount: settlement.amount, currency: settlement.currency, updatedAt: settlement.updatedAt }, participant: { id: settlement.registration.user.id, name: settlement.registration.user.name, email: settlement.registration.user.email }, wallet: { id: wallet.id, balance: wallet.balance.toString(), currency: wallet.currency }, creditedAt: credit.createdAt, idempotent: true };
      }
      if (settlement.status !== TournamentPrizeSettlementStatus.APPROVED) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.SETTLEMENT_NOT_APPROVED, "Only approved prize settlements can be credited.");
      if (settlement.tournament.status !== TournamentStatus.COMPLETED) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.TOURNAMENT_NOT_COMPLETED, "Only completed tournaments can be credited.");
      if (settlement.prize.status !== TournamentPrizeStatus.FINALIZED) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.PRIZE_NOT_FINALIZED, "The prize configuration is not finalized.");
      if (settlement.result.resultStatus !== TournamentResultStatus.VERIFIED || settlement.result.tournamentId !== settlement.tournamentId || settlement.result.registrationId !== settlement.registrationId || settlement.result.rank !== settlement.rank) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.RESULT_NOT_VERIFIED, "The verified result is no longer valid for this settlement.");
      if (settlement.registration.status !== RegistrationStatus.CONFIRMED || settlement.registration.tournamentId !== settlement.tournamentId || settlement.registration.user.id !== settlement.registration.userId) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.REGISTRATION_NOT_CONFIRMED, "The winner registration is no longer eligible.");
      if (settlement.prize.rank !== settlement.rank) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.INTEGRITY_ERROR, "The settlement rank no longer matches the prize configuration.");
      const amount = positiveMoney(settlement.amount.toString());
      if (compareMoney(amount, settlement.prize.amount.toString()) !== 0) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.INVALID_AMOUNT, "Settlement amount does not match the authoritative prize amount.");
      if (!isSupportedCurrency(settlement.currency) || settlement.currency !== SETTLEMENT_CURRENCY) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.CURRENCY_MISMATCH, "Settlement currency is not supported.");
      const wallet = await tx.wallet.upsert({ where: { userId: settlement.registration.userId }, create: { userId: settlement.registration.userId, currency: SETTLEMENT_CURRENCY, balance: "0.00" }, update: {}, select: { id: true, userId: true, currency: true, balance: true } });
      if (wallet.userId !== settlement.registration.userId) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.WALLET_NOT_FOUND, "Winner wallet ownership could not be verified.");
      if (wallet.currency !== settlement.currency) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.CURRENCY_MISMATCH, "Settlement currency does not match wallet currency.");
      const existingCredit = await tx.walletTransaction.findFirst({ where: { walletId: wallet.id, referenceType: "PRIZE_SETTLEMENT", referenceId: settlement.id, type: WalletTransactionType.CREDIT, category: WalletTransactionCategory.PRIZE }, select: { id: true, amount: true, currency: true } });
      if (existingCredit) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.DUPLICATE_CREDIT, "A prize credit for this settlement already exists.");
      const rows = await tx.$queryRaw<Array<{ id: string; balance: string }>>(Prisma.sql`SELECT "id", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`);
      const lockedWallet = rows[0]; if (!lockedWallet) throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.WALLET_NOT_FOUND, "Winner wallet could not be found.");
      const nextBalance = addMoney(lockedWallet.balance, amount);
      try { await tx.walletTransaction.create({ data: { walletId: wallet.id, type: WalletTransactionType.CREDIT, category: WalletTransactionCategory.PRIZE, amount, currency: settlement.currency, referenceType: "PRIZE_SETTLEMENT", referenceId: settlement.id, description: `Tournament prize for ${settlement.tournament.name}, Rank ${settlement.rank}` } }); }
      catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.DUPLICATE_CREDIT, "A prize credit for this settlement already exists."); throw error; }
      const updatedWallet = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: nextBalance }, select: { id: true, balance: true, currency: true } });
      const updatedSettlement = await tx.tournamentPrizeSettlement.update({ where: { id: settlement.id }, data: { status: TournamentPrizeSettlementStatus.CREDITED }, select: { id: true, status: true, amount: true, currency: true, updatedAt: true } });
      return { settlement: updatedSettlement, participant: { id: settlement.registration.user.id, name: settlement.registration.user.name, email: settlement.registration.user.email }, wallet: { id: updatedWallet.id, balance: updatedWallet.balance.toString(), currency: updatedWallet.currency }, creditedAt: updatedSettlement.updatedAt, idempotent: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof PrizeSettlementWalletError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.DUPLICATE_CREDIT, "Prize settlement credit changed concurrently. Refresh and verify the settlement status.");
    throw new PrizeSettlementWalletError(PRIZE_SETTLEMENT_WALLET_ERROR_CODES.FINANCIAL_RECONCILIATION_FAILED, "Prize settlement wallet credit failed. No financial changes were committed.");
  }
}
