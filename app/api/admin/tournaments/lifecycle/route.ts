import { NextResponse } from "next/server";
import { updateDueTournamentLifecycles } from "@/lib/tournament-lifecycle";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const systemActor = process.env.CRON_ACTOR_USER_ID?.trim();
  if (!secret || !systemActor) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await updateDueTournamentLifecycles();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Tournament lifecycle update failed:", error);
    return NextResponse.json({ error: "Unable to update tournament lifecycle." }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
