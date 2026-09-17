import { NextResponse } from "next/server";
import { revokeTournamentAccessCode } from "@/lib/tournament-access-code";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const revoked = await revokeTournamentAccessCode(id);
    if (!revoked) return NextResponse.json({ ok: false, message: "Access code not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to revoke the tournament access code." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
