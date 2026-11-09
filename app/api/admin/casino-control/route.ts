import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNetlifyAviatorRoundSnapshot } from "@/lib/games/aviator/serverless";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();

  const round = await getNetlifyAviatorRoundSnapshot();
  const grouped = await prisma.aviatorBet.groupBy({
    by: ["userId"],
    where: { roundId: round.roundId },
    _count: { _all: true },
    _sum: { stake: true, payout: true },
    orderBy: { _sum: { stake: "desc" } },
  });

  const activeSummary = await prisma.aviatorBet.aggregate({
    where: { roundId: round.roundId, status: "ACTIVE" },
    _count: { _all: true },
    _sum: { stake: true },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((item) => item.userId) } },
    select: { id: true, name: true, email: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  const bets = await prisma.aviatorBet.findMany({
    where: { roundId: round.roundId },
    select: { id: true, userId: true, stake: true, status: true, payout: true, placedAt: true },
    orderBy: { placedAt: "desc" },
    take: 200,
  });

  const totalStake = grouped.reduce((sum, item) => sum + Number(item._sum.stake ?? 0), 0);
  const totalPayout = grouped.reduce((sum, item) => sum + Number(item._sum.payout ?? 0), 0);

  return NextResponse.json({
    round: {
      id: round.roundId,
      phase: round.phase,
      multiplier: round.multiplier,
      serverTime: round.serverTime,
      startedAt: round.startedAt,
    },
    summary: {
      users: grouped.length,
      bets: grouped.reduce((sum, item) => sum + item._count._all, 0),
      totalStake: totalStake.toFixed(2),
      totalPayout: totalPayout.toFixed(2),
      activeBets: activeSummary._count._all,
      activeStake: Number(activeSummary._sum.stake ?? 0).toFixed(2),
    },
    users: grouped.map((item) => {
      const user = userById.get(item.userId);
      return {
        userId: item.userId,
        name: user?.name ?? "Player",
        email: user?.email ?? "",
        bets: item._count._all,
        stake: Number(item._sum.stake ?? 0).toFixed(2),
        payout: Number(item._sum.payout ?? 0).toFixed(2),
      };
    }),
    recentBets: bets.map((bet) => ({
      id: bet.id,
      userId: bet.userId,
      player: userById.get(bet.userId)?.name ?? userById.get(bet.userId)?.email ?? "Player",
      stake: bet.stake.toString(),
      status: bet.status,
      payout: bet.payout.toString(),
      placedAt: bet.placedAt.toISOString(),
    })),
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
