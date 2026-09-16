import { NextResponse } from "next/server";
import { rejectMatchResult } from "@/lib/match-results";

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const body = await request.json();
    return NextResponse.json(await rejectMatchResult(matchId, body?.resultId, typeof body?.reason === "string" ? body.reason : undefined), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to reject this result." }, { status: 400 });
  }
}
