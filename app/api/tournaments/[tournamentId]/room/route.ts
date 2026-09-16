import { NextResponse } from "next/server";
import { getParticipantTournamentAccess } from "@/lib/tournament-access-flow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  try {
    const body = await request.json();
    const accessCode = typeof body?.accessCode === "string" ? body.accessCode : "";
    const result = await getParticipantTournamentAccess(tournamentId, accessCode);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.reason, ...(result.accessOpensAt ? { accessOpensAt: result.accessOpensAt.toISOString() } : {}) },
        { status: result.reason === "Login to continue." ? 401 : 403, headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to access tournament joining details." }, { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
