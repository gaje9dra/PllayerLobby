import { NextResponse } from "next/server";
import { listActiveGames } from "@/lib/game-management";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const games = await listActiveGames();
    return NextResponse.json({ games }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("Public game listing failed:", error);
    return NextResponse.json({ error: "Unable to load games." }, { status: 500 });
  }
}
