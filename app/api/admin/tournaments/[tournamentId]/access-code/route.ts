import { NextResponse } from "next/server";
import { createOrGetTournamentAccessCode, getTournamentAccessCodeAdmin } from "@/lib/tournament-access-code";

export const dynamic = "force-dynamic";

function noStore<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { "Cache-Control": "private, no-store", ...(init?.headers ?? {}) } });
}

export async function GET(request: Request, context: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await context.params;
  const reveal = new URL(request.url).searchParams.get("reveal") === "1";
  try {
    const data = await getTournamentAccessCodeAdmin(tournamentId, reveal);
    if (!data) return noStore({ ok: false, message: "Access code not found." }, { status: 404 });
    return noStore({ ok: true, data });
  } catch {
    return noStore({ ok: false, message: "Unable to access tournament credentials." }, { status: 403 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await context.params;
  try {
    const code = await createOrGetTournamentAccessCode(tournamentId);
    return noStore({ ok: true, code });
  } catch {
    return noStore({ ok: false, message: "Unable to create the tournament access code." }, { status: 400 });
  }
}
