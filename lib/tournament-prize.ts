import "server-only";

import { TournamentStatus, TournamentResultStatus, RegistrationStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addMoney, canFinalizePrizeAllocation, compareMoney, normalizePrizeAmount, parsePrizeRank } from "@/lib/prize-rules";

export async function getTournamentPrizes(tournamentId: string) {
  await requireAdmin();
  return prisma.tournamentPrize.findMany({ where: { tournamentId }, orderBy: { rank: "asc" } });
}

export async function calculateTournamentPrizes(tournamentId: string) {
  await requireAdmin();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, prizePool: true, status: true },
  });
  if (!tournament) throw new Error("Tournament not found.");
  const prizes = await prisma.tournamentPrize.findMany({ where: { tournamentId, status: "FINALIZED" }, orderBy: { rank: "asc" } });
  const results = await prisma.tournamentResult.findMany({
    where: { tournamentId, resultStatus: TournamentResultStatus.VERIFIED, registration: { status: RegistrationStatus.CONFIRMED } },
    select: { rank: true, registrationId: true, registration: { select: { user: { select: { id: true, name: true, email: true } } } } },
    orderBy: { rank: "asc" },
  });
  const byRank = new Map(results.map((result) => [result.rank, result]));
  return prizes.map((prize) => {
    const result = byRank.get(prize.rank);
    return { rank: prize.rank, amount: prize.amount.toString(), registrationId: result?.registrationId ?? null, participant: result?.registration.user ?? null };
  });
}

export async function getPrizeSummary(tournamentId: string) {
  await requireAdmin();
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { prizePool: true } });
  if (!tournament) throw new Error("Tournament not found.");
  const prizes = await prisma.tournamentPrize.findMany({ where: { tournamentId }, select: { amount: true } });
  const allocated = addMoney(prizes.map((prize) => prize.amount.toString()));
  return { prizePool: tournament.prizePool.toString(), allocated, remaining: addMoney([tournament.prizePool.toString(), `-${allocated}`]) };
}

export async function createTournamentPrize(tournamentId: string, rankInput: string, amountInput: string) {
  await requireAdmin();
  const rank = parsePrizeRank(rankInput);
  const amount = normalizePrizeAmount(amountInput);
  if (!rank) throw new Error("Prize rank must be a positive integer.");
  if (!amount || compareMoney(amount, "0.00") <= 0) throw new Error("Prize amount must be a positive monetary value with at most two decimals.");
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { prizePool: true, status: true } });
  if (!tournament || tournament.status === TournamentStatus.CANCELLED) throw new Error("Tournament is unavailable.");
  const existing = await prisma.tournamentPrize.findMany({ where: { tournamentId }, select: { amount: true } });
  const total = addMoney([...existing.map((p) => p.amount.toString()), amount]);
  if (compareMoney(total, tournament.prizePool.toString()) > 0) throw new Error("Allocated prizes cannot exceed the tournament prize pool.");
  return prisma.tournamentPrize.create({ data: { tournamentId, rank, amount, status: "DRAFT" } });
}

export async function updateTournamentPrize(prizeId: string, rankInput: string, amountInput: string) {
  await requireAdmin();
  const rank = parsePrizeRank(rankInput);
  const amount = normalizePrizeAmount(amountInput);
  if (!rank) throw new Error("Prize rank must be a positive integer.");
  if (!amount || compareMoney(amount, "0.00") <= 0) throw new Error("Prize amount must be a positive monetary value with at most two decimals.");
  const prize = await prisma.tournamentPrize.findUnique({ where: { id: prizeId }, select: { id: true, tournamentId: true, status: true } });
  if (!prize || prize.status !== "DRAFT") throw new Error("Only draft prizes can be edited.");
  const tournament = await prisma.tournament.findUnique({ where: { id: prize.tournamentId }, select: { prizePool: true, status: true } });
  if (!tournament || tournament.status === TournamentStatus.CANCELLED) throw new Error("Tournament is unavailable.");
  const others = await prisma.tournamentPrize.findMany({ where: { tournamentId: prize.tournamentId, id: { not: prizeId } }, select: { amount: true } });
  const total = addMoney([...others.map((p) => p.amount.toString()), amount]);
  if (compareMoney(total, tournament.prizePool.toString()) > 0) throw new Error("Allocated prizes cannot exceed the tournament prize pool.");
  return prisma.tournamentPrize.update({ where: { id: prizeId }, data: { rank, amount } });
}

export async function deleteTournamentPrize(prizeId: string) {
  await requireAdmin();
  const prize = await prisma.tournamentPrize.findUnique({ where: { id: prizeId }, select: { id: true, status: true } });
  if (!prize || prize.status !== "DRAFT") throw new Error("Only draft prizes can be removed.");
  return prisma.tournamentPrize.delete({ where: { id: prizeId } });
}

export async function finalizePrizeConfiguration(tournamentId: string) {
  await requireAdmin();
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, prizePool: true, status: true } });
  if (!tournament) throw new Error("Tournament not found.");
  if (tournament.status === TournamentStatus.CANCELLED) throw new Error("Cancelled tournaments cannot finalize prizes.");
  const prizes = await prisma.tournamentPrize.findMany({ where: { tournamentId }, orderBy: { rank: "asc" } });
  if (prizes.length === 0) throw new Error("Add at least one prize position before finalization.");
  const ranks = new Set<number>();
  for (const prize of prizes) {
    if (ranks.has(prize.rank)) throw new Error("Prize ranks must be unique.");
    ranks.add(prize.rank);
    if (compareMoney(prize.amount.toString(), "0.00") <= 0) throw new Error("Prize amounts must be positive.");
  }
  const total = addMoney(prizes.map((prize) => prize.amount.toString()));
  if (!canFinalizePrizeAllocation(total, tournament.prizePool.toString())) throw new Error("Finalization requires allocated prizes to equal the tournament prize pool.");
  return prisma.$transaction(async (tx) => {
    const current = await tx.tournamentPrize.findMany({ where: { tournamentId }, select: { id: true, status: true } });
    if (current.some((prize) => prize.status === "FINALIZED")) throw new Error("Prize configuration is already finalized.");
    return tx.tournamentPrize.updateMany({ where: { tournamentId, status: "DRAFT" }, data: { status: "FINALIZED" } });
  });
}
