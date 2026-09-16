import { NextResponse } from "next/server";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";
import { getTournamentGameConfig, parseGameConfigForm, upsertTournamentGameConfig } from "@/lib/game-specific-config";
import { prisma } from "@/lib/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); const { id } = await params; if (!UUID.test(id)) return NextResponse.json({ error: "Invalid tournament identifier." }, { status: 400 });
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, gameId: true, game: { select: { code: true, name: true } } } }); if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  const config = await getTournamentGameConfig(id); if (!config) return NextResponse.json({ tournamentId: id, game: tournament.game, configuration: null }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
  if (config.gameId !== tournament.gameId || config.gameCode !== tournament.game.code) return NextResponse.json({ error: "Stored game configuration does not match the tournament game." }, { status: 409 });
  return NextResponse.json({ tournamentId: id, game: tournament.game, configuration: config.configuration, version: config.version }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); const { id } = await params; if (!UUID.test(id)) return NextResponse.json({ error: "Invalid tournament identifier." }, { status: 400 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !("gameConfig" in body)) return NextResponse.json({ error: "gameConfig is required." }, { status: 400 });
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, gameId: true, status: true, game: { select: { id: true, code: true, isActive: true } } } }); if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 }); if (!tournament.game.isActive) return NextResponse.json({ error: "The selected game is inactive." }, { status: 409 });
  if (tournament.status !== TournamentStatus.DRAFT) return NextResponse.json({ error: "Game-specific configuration cannot be changed after publication." }, { status: 409 });
  const participantCount = await prisma.registration.count({ where: { tournamentId: id, status: { not: "CANCELLED" } } }); if (participantCount > 0) return NextResponse.json({ error: "Game-specific configuration cannot be changed after participant activity." }, { status: 409 });
  const parsed = parseGameConfigForm(tournament.game.code, JSON.stringify((body as { gameConfig: unknown }).gameConfig)); if (!parsed.ok) return NextResponse.json({ error: parsed.errors.form ?? "Invalid game-specific configuration." }, { status: 422 });
  await prisma.$transaction(async (tx) => { await upsertTournamentGameConfig(id, tournament.game.id, tournament.game.code as "VALORANT" | "STUMBLE_GUYS", parsed.config, tx); await recordAdminAuditEventInTransaction(tx, admin.id, { action: "GAME_CONFIG_UPDATED", targetType: "TOURNAMENT", targetId: id, metadata: { gameId: tournament.game.id, gameCode: tournament.game.code, version: parsed.config.version } }); });
  return NextResponse.json({ ok: true, tournamentId: id, configuration: parsed.config }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
}
