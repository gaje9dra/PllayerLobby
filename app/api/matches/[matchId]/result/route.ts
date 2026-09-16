import { NextResponse } from "next/server";
import { getMatchResult, submitMatchResult } from "@/lib/match-results";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const result = await getMatchResult(matchId);
    return noStore(result, result.ok ? 200 : 403);
  } catch {
    return noStore({ ok: false, message: "Unable to load match result." }, 400);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const body = await request.json();
    const result = await submitMatchResult(matchId, body);
    return noStore(result, result.ok ? 201 : 400);
  } catch {
    return noStore({ ok: false, message: "Unable to submit match result." }, 400);
  }
}
