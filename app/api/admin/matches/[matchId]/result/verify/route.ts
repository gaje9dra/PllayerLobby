import { NextResponse } from "next/server";
import { verifyMatchResult } from "@/lib/match-results";

export async function POST(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    return NextResponse.json(await verifyMatchResult(matchId, (await _request.json()).resultId), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to verify this result." }, { status: 400 });
  }
}
