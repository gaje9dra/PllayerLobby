import { NextResponse } from "next/server";
import { verifyTournamentAccessCode } from "@/lib/tournament-access-code";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await context.params;
  let input = "";
  try {
    const body = await request.json();
    input = typeof body?.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ verified: false }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const result = await verifyTournamentAccessCode(tournamentId, input);
    return NextResponse.json(result, { status: result.verified ? 200 : 403, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ verified: false }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
}
