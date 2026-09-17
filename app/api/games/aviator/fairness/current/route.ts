import { NextResponse } from "next/server";
import { getAviatorRoundSnapshot } from "@/lib/games/aviator/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = getAviatorRoundSnapshot();
  return NextResponse.json(snapshot.fairness, { headers: { "Cache-Control": "no-store" } });
}
