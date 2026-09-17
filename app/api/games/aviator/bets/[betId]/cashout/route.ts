import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cashoutNetlifyAviatorBetForUser } from "@/lib/games/aviator/serverless-betting";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ betId: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return noStore({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const { betId } = await params;
  const body = await request.json().catch(() => null);
  const roundId = body && typeof body.roundId === "string" ? body.roundId : "";
  const result = await cashoutNetlifyAviatorBetForUser(user, betId, roundId);
  if (!result.ok) {
    const status = result.code === "RATE_LIMITED" ? 429 : result.code === "BET_NOT_FOUND" ? 404 : result.code === "BET_ALREADY_SETTLED" || result.code === "CASHOUT_TOO_LATE" || result.code === "ROUND_ALREADY_CRASHED" ? 409 : 400;
    return noStore({ error: result.code, message: result.message }, status);
  }
  return noStore(result);
}
