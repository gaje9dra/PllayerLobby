import { NextResponse } from "next/server";
import { getParticipantRoomAccess } from "@/lib/tournament-room";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  try {
    const body = await request.json();
    const registrationId = typeof body?.registrationId === "string" ? body.registrationId : "";
    const registrationCode = typeof body?.registrationCode === "string" ? body.registrationCode : "";
    const result = await getParticipantRoomAccess({ tournamentId, registrationId, registrationCode });
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.reason }, { status: result.reason === "Login to continue." ? 401 : 403, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to access tournament joining details." }, { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
