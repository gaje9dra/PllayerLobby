import Link from "next/link";
import { notFound } from "next/navigation";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { CancelTournamentButton } from "@/app/admin/tournaments/cancel-button";
import { TournamentStatusBadge } from "@/components/admin/tournament-status-badge";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatAppDateTime } from "@/lib/timezone";

type SearchParams = Promise<{ updated?: string; cancelled?: string }>;
function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</dt><dd className="mt-1 break-words text-sm text-slate-200">{children}</dd></div>; }

export default async function AdminTournamentDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await requireAdmin();
  const { id } = await params;
  const { updated, cancelled } = await searchParams;
  const tournament = await prisma.tournament.findUnique({ where: { id }, include: { game: { select: { id: true, name: true, logoUrl: true, isActive: true } } } });
  if (!tournament) notFound();
  const canCancel = tournament.status !== TournamentStatus.CANCELLED && tournament.status !== TournamentStatus.COMPLETED;

  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><Link href="/admin/tournaments" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Back to tournaments</Link><div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{tournament.name}</h1><TournamentStatusBadge status={tournament.status} /></div><p className="mt-2 break-all text-sm text-slate-500">/{tournament.slug}</p></div>
        <div className="flex flex-wrap gap-2"><Button href={`/admin/tournaments/${tournament.id}/edit`}>Edit Tournament</Button><Button href={`/admin/tournaments/${tournament.id}/registrations`} variant="secondary">Manage Registrations</Button><Button href={`/admin/tournaments/${tournament.id}/results`} variant="secondary">Manage Results</Button><Button href={`/admin/tournaments/${tournament.id}/room`} variant="secondary">Manage Room</Button></div>
      </div>
      {updated === "1" ? <div role="status" className="mt-6 rounded-xl border border-lime-300/20 bg-lime-300/10 px-4 py-3 text-sm font-medium text-lime-200">Tournament updated successfully.</div> : null}
      {cancelled === "1" ? <div role="status" className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-200">Tournament cancelled successfully. The record remains in the database.</div> : null}
      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-white">Configuration</h2><p className="mt-1 text-sm text-slate-500">Stored tournament values from PostgreSQL.</p></div><p className="text-sm font-semibold text-slate-300">{tournament.game.name}</p></div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Game">{tournament.game.name}{!tournament.game.isActive ? " (inactive)" : ""}</Detail><Detail label="Tournament name">{tournament.name}</Detail><Detail label="Slug">{tournament.slug}</Detail><Detail label="Description">{tournament.description || "—"}</Detail><Detail label="Rules">{tournament.rules || "—"}</Detail><Detail label="Banner URL">{tournament.bannerUrl || "—"}</Detail><Detail label="Tournament start">{formatAppDateTime(tournament.startTime)}</Detail><Detail label="Registration start">{tournament.registrationStartTime ? formatAppDateTime(tournament.registrationStartTime) : "—"}</Detail><Detail label="Registration end">{tournament.registrationEndTime ? formatAppDateTime(tournament.registrationEndTime) : "—"}</Detail><Detail label="Entry fee">₹{tournament.entryFee.toFixed(2)}</Detail><Detail label="Prize pool">₹{tournament.prizePool.toFixed(2)}</Detail><Detail label="Maximum participants">{tournament.maxParticipants?.toLocaleString() ?? "—"}</Detail><Detail label="Format">{tournament.tournamentFormat}</Detail><Detail label="Region / server">{tournament.region}</Detail><Detail label="Joining window">{tournament.joiningWindowMinutes} minutes</Detail><Detail label="Status"><TournamentStatusBadge status={tournament.status} /></Detail><Detail label="Created">{formatAppDateTime(tournament.createdAt)}</Detail><Detail label="Updated">{formatAppDateTime(tournament.updatedAt)}</Detail>
        </dl>
      </section>
      <section className="mt-6 rounded-2xl border border-rose-400/15 bg-rose-400/[0.03] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">Danger zone</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Cancellation preserves the tournament record and its configuration for future registration, payment, refund, and payout history.</p><div className="mt-5 max-w-sm"><CancelTournamentButton tournamentId={tournament.id} disabled={!canCancel} /></div>{!canCancel ? <p className="mt-3 text-xs text-slate-600">{tournament.status === TournamentStatus.COMPLETED ? "Completed tournaments cannot be cancelled." : "This tournament is already cancelled."}</p> : null}</section>
    </SectionContainer>
  );
}
