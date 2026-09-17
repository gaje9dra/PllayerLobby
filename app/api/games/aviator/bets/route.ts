import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWalletForUser } from "@/lib/wallet";
import { getCurrentUserAviatorBets } from "@/lib/games/aviator/betting";
import { placeNetlifyAviatorBetForUser } from "@/lib/games/aviator/serverless-betting";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return noStore({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const url = new URL(request.url);
  const roundId = url.searchParams.get("roundId") ?? undefined;
  const [wallet, bets] = await Promise.all([getOrCreateWalletForUser(user.id), getCurrentUserAviatorBets(user.id, roundId)]);
  return noStore({ walletBalance: wallet.balance.toString(), bets: bets.map((bet) => ({ ...bet, stake: bet.stake.toString(), cashoutMultiplier: bet.cashoutMultiplier?.toString() ?? null, autoCashoutMultiplier: bet.autoCashoutMultiplier?.toString() ?? null, payout: bet.payout.toString(), placedAt: bet.placedAt.toISOString(), cashedOutAt: bet.cashedOutAt?.toISOString() ?? null })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return noStore({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return noStore({ error: "INVALID_BET_AMOUNT" }, 400);
  const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId : request.headers.get("idempotency-key") ?? "";
  const result = await placeNetlifyAviatorBetForUser(user, { roundId: typeof body.roundId === "string" ? body.roundId : "", amount: body.amount, clientRequestId, autoCashoutMultiplier: body.autoCashoutMultiplier });
  if (!result.ok) {
    const status = result.code === "AUTHENTICATION_REQUIRED" ? 401 : result.code === "INSUFFICIENT_BALANCE" ? 409 : result.code === "RATE_LIMITED" ? 429 : result.code === "ROUND_ALREADY_RUNNING" || result.code === "ROUND_ALREADY_CRASHED" ? 409 : 400;
    return noStore({ error: result.code, message: result.message }, status);
  }
  return noStore(result);
}
