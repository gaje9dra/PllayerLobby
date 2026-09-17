import { NextResponse } from "next/server";
import { getAviatorHistory } from "@/lib/games/aviator/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  const rounds = await getAviatorHistory();
  return NextResponse.json(rounds, { headers: { "Cache-Control": "no-store" } });
}
