import { NextResponse } from "next/server";
import { listPendingMatchResults } from "@/lib/match-results";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const tournamentId = new URL(request.url).searchParams.get("tournamentId") ?? undefined;
    return NextResponse.json({ ok: true, data: await listPendingMatchResults(tournamentId) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to load match results." }, { status: 403, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
