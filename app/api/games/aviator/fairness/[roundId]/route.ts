import { NextResponse } from "next/server";
import { getAviatorFairnessReveal } from "@/lib/games/aviator/persistence";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await context.params;
  if (!UUID.test(roundId)) return NextResponse.json({ error: "ROUND_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const result = await getAviatorFairnessReveal(roundId);
  if (!result.ok) {
    const status = result.code === "ROUND_NOT_FOUND" ? 404 : result.code === "ROUND_NOT_COMPLETE" ? 409 : 422;
    return NextResponse.json({ error: result.code }, { status, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ...result.reveal, verification: result.verification }, { headers: { "Cache-Control": "no-store" } });
}
