import { NextResponse } from "next/server";
import { createGame, GameValidationError, listGames } from "@/lib/game-management";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const games = await listGames({ search: url.searchParams.get("search") ?? "", status: url.searchParams.get("status") ?? "ALL" });
    return NextResponse.json({ games });
  } catch (error) {
    console.error("Admin game listing failed:", error);
    return NextResponse.json({ error: "Unable to load games." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    const game = await createGame(body as Record<string, unknown>);
    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    if (error instanceof GameValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Admin game creation failed:", error);
    return NextResponse.json({ error: "Unable to create game." }, { status: 500 });
  }
}
