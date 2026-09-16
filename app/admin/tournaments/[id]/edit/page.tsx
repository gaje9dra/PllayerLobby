import { notFound } from "next/navigation";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { TournamentForm } from "@/app/admin/tournaments/form";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatAppDateTimeLocal } from "@/lib/timezone";
import { getTournamentGameConfig } from "@/lib/game-specific-config";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STATUS_TRANSITIONS: Record<TournamentStatus, readonly TournamentStatus[]> = { DRAFT: [TournamentStatus.DRAFT, TournamentStatus.UPCOMING, TournamentStatus.CANCELLED], UPCOMING: [TournamentStatus.UPCOMING, TournamentStatus.REGISTRATION_OPEN, TournamentStatus.CANCELLED], REGISTRATION_OPEN: [TournamentStatus.REGISTRATION_OPEN, TournamentStatus.REGISTRATION_CLOSED, TournamentStatus.CANCELLED], REGISTRATION_CLOSED: [TournamentStatus.REGISTRATION_CLOSED, TournamentStatus.LIVE, TournamentStatus.CANCELLED], LIVE: [TournamentStatus.LIVE, TournamentStatus.COMPLETED, TournamentStatus.CANCELLED], COMPLETED: [TournamentStatus.COMPLETED], CANCELLED: [TournamentStatus.CANCELLED] };

export default async function EditTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, gameId: true, name: true, slug: true, description: true, rules: true, bannerUrl: true, startTime: true, registrationStartTime: true, registrationEndTime: true, entryFee: true, prizePool: true, maxParticipants: true, tournamentFormat: true, region: true, joiningWindowMinutes: true, status: true } });
  if (!tournament) notFound();
  const games = await prisma.game.findMany({ where: { OR: [{ isActive: true }, { id: tournament.gameId }] }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, isActive: true } });
  const statusOptions = [...ALLOWED_STATUS_TRANSITIONS[tournament.status]];
  const gameConfig = await getTournamentGameConfig(tournament.id);
  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Administration / Tournaments</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Edit Tournament</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Update configuration and status. Every change is revalidated on the server.</p></div>
      <TournamentForm mode="edit" tournamentId={tournament.id} games={games.filter((game) => game.isActive || game.id === tournament.gameId).map(({ id: gameId, name, code }) => ({ id: gameId, name, code }))} statusOptions={statusOptions} initialValues={{ gameId: tournament.gameId, name: tournament.name, slug: tournament.slug, description: tournament.description ?? "", rules: tournament.rules ?? "", bannerUrl: tournament.bannerUrl ?? "", startTime: formatAppDateTimeLocal(tournament.startTime), registrationStartTime: tournament.registrationStartTime ? formatAppDateTimeLocal(tournament.registrationStartTime) : "", registrationEndTime: tournament.registrationEndTime ? formatAppDateTimeLocal(tournament.registrationEndTime) : "", entryFee: tournament.entryFee.toString(), prizePool: tournament.prizePool.toString(), maxParticipants: tournament.maxParticipants?.toString() ?? "", tournamentFormat: tournament.tournamentFormat, region: tournament.region, joiningWindowMinutes: tournament.joiningWindowMinutes.toString(), status: tournament.status, gameConfig: gameConfig?.configuration }} />
      {tournament.status === TournamentStatus.CANCELLED ? <p className="mt-5 text-center text-xs text-slate-600">Cancelled tournaments remain cancelled; status reopening is intentionally disabled.</p> : null}
    </SectionContainer>
  );
}
