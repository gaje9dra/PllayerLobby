import { NextResponse } from "next/server";
import { disputeMatchResult } from "@/lib/match-results";

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const body = await request.json();
    return NextResponse.json(await disputeMatchResult(matchId, body?.resultId), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to dispute this result." }, { status: 400 });
  }
}
