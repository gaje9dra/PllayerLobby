import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAviatorBetHistory } from "@/lib/games/aviator/betting";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

type HistoryBet = {
  stake: { toString(): string };
  cashoutMultiplier: { toString(): string } | null;
  payout: { toString(): string };
  placedAt: { toISOString(): string };
  cashedOutAt: { toISOString(): string } | null;
  createdAt: { toISOString(): string };
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return noStore({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const result = await getAviatorBetHistory(user.id, page);
  const items = (result.items as HistoryBet[]).map((bet) => ({
    ...bet,
    stake: bet.stake.toString(),
    cashoutMultiplier: bet.cashoutMultiplier?.toString() ?? null,
    payout: bet.payout.toString(),
    placedAt: bet.placedAt.toISOString(),
    cashedOutAt: bet.cashedOutAt?.toISOString() ?? null,
    createdAt: bet.createdAt.toISOString(),
  }));
  return noStore({ ...result, items });
}
