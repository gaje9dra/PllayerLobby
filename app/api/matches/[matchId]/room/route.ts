import { NextResponse } from "next/server";
import { getParticipantMatchRoomAccess } from "@/lib/match-room";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  try {
    const result = await getParticipantMatchRoomAccess(matchId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.reason }, {
        status: result.reason === "Login to continue." ? 401 : 403,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      });
    }
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to access match room credentials." }, { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
