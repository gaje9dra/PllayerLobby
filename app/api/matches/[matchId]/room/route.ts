import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Use the tournament joining flow to access your assigned room." },
    { status: 403, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
