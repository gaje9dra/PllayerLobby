import { NextResponse } from "next/server";
import { getNetlifyAviatorRoundSnapshot } from "@/lib/games/aviator/serverless";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getNetlifyAviatorRoundSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
