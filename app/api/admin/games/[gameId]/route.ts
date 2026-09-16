import { NextResponse } from "next/server";
import { deleteGame, GameValidationError, updateGame } from "@/lib/game-management";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    const game = await updateGame(gameId, body as Record<string, unknown>);
    return NextResponse.json({ game });
  } catch (error) {
    if (error instanceof GameValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Admin game update failed:", error);
    return NextResponse.json({ error: "Unable to update game." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  try {
    await deleteGame(gameId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof GameValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Admin game deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete game." }, { status: 500 });
  }
}
