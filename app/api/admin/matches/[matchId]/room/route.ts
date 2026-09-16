import { NextResponse } from "next/server";
import { getAdminMatchRoom, revokeMatchRoom, upsertMatchRoom } from "@/lib/match-room";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  try {
    const reveal = new URL(request.url).searchParams.get("reveal") === "1";
    return noStore({ ok: true, data: await getAdminMatchRoom(matchId, reveal) });
  } catch {
    return noStore({ ok: false, message: "Unable to load room credentials." }, 400);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  try {
    const body = await request.json();
    const roomId = typeof body?.roomId === "string" ? body.roomId : "";
    const roomPassword = typeof body?.roomPassword === "string" ? body.roomPassword : "";
    const published = body?.published !== false;
    const result = await upsertMatchRoom({ matchId, roomId, roomPassword, published });
    return noStore(result, result.ok ? 200 : 400);
  } catch {
    return noStore({ ok: false, message: "Unable to update room credentials." }, 400);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  return POST(request, { params });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  try {
    const result = await revokeMatchRoom(matchId);
    return noStore(result, result.ok ? 200 : 400);
  } catch {
    return noStore({ ok: false, message: "Unable to remove room credentials." }, 400);
  }
}
