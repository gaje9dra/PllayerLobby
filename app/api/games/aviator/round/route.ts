import { NextResponse } from "next/server";
import { getAviatorRoundSnapshot } from "@/lib/games/aviator/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getAviatorRoundSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
