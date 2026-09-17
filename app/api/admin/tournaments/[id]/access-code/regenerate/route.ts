import { NextResponse } from "next/server";
import { regenerateTournamentAccessCode } from "@/lib/tournament-access-code";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const code = await regenerateTournamentAccessCode(id);
    return NextResponse.json({ ok: true, code }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to regenerate the tournament access code." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
