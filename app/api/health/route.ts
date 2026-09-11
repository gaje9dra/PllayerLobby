import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ status: "healthy" }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
