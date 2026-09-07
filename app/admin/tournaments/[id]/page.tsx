import { notFound } from "next/navigation";
import { Button, SectionContainer } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { TournamentStatusBadge } from "@/components/tournaments/tournament-status-badge";
import { CancelTournamentButton } from "@/app/admin/tournaments/[id]/cancel-tournament-button";
import { formatAppDateTime } from "@/lib/date-time";

export default async function AdminTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id }, include: { game: true } });
  if (!tournament) notFound();
  const canCancel = tournament.status !== TournamentStatus.COMPLETED && tournament.status !== TournamentStatus.CANCELLED;
  return (
    <SectionContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-lime-300">Admin tournament</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{tournament.name}</h1></div><div className="flex flex-wrap gap-2"><Button href="/admin/tournaments" variant="secondary">Back to Tournaments</Button><Button href={`/admin/tournaments/${tournament.id}/edit`} variant="secondary">Edit Tournament</Button><Button href={`/admin/tournaments/${tournament.id}/participants`} variant="secondary">Participants</Button><Button href={`/admin/tournaments/${tournament.id}/results`} variant="secondary">Manage Results</Button></div></div>
      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-white">Configuration</h2><p className="mt-1 text-sm text-slate-500">Stored tournament values from PostgreSQL.</p></div><p className="text-sm font-semibold text-slate-300">{tournament.game.name}</p></div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Game">{tournament.game.name}{!tournament.game.isActive ? " (inactive)" : ""}</Detail><Detail label="Tournament name">{tournament.name}</Detail><Detail label="Slug">{tournament.slug}</Detail><Detail label="Description">{tournament.description || "—"}</Detail><Detail label="Rules">{tournament.rules || "—"}</Detail><Detail label="Banner URL">{tournament.bannerUrl || "—"}</Detail><Detail label="Tournament start">{formatAppDateTime(tournament.startTime)}</Detail><Detail label="Registration start">{tournament.registrationStartTime ? formatAppDateTime(tournament.registrationStartTime) : "—"}</Detail><Detail label="Registration end">{tournament.registrationEndTime ? formatAppDateTime(tournament.registrationEndTime) : "—"}</Detail><Detail label="Entry fee">₹{tournament.entryFee.toFixed(2)}</Detail><Detail label="Prize pool">₹{tournament.prizePool.toFixed(2)}</Detail><Detail label="Maximum participants">{tournament.maxParticipants?.toLocaleString() ?? "—"}</Detail><Detail label="Format">{tournament.tournamentFormat}</Detail><Detail label="Region / server">{tournament.region}</Detail><Detail label="Joining window">{tournament.joiningWindowMinutes} minutes</Detail><Detail label="Status"><TournamentStatusBadge status={tournament.status} /></Detail><Detail label="Created">{formatAppDateTime(tournament.createdAt)}</Detail><Detail label="Updated">{formatAppDateTime(tournament.updatedAt)}</Detail>
        </dl>
      </section>
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">Prize configuration</h2><p className="mt-1 text-sm leading-6 text-slate-500">Configure and finalize the tournament&apos;s official prize allocation without making payouts.</p><div className="mt-5"><Button href={`/admin/tournaments/${tournament.id}/prizes`} variant="secondary">Open Prize Management</Button></div></section>
      <section className="mt-6 rounded-2xl border border-rose-400/15 bg-rose-400/[0.03] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">Danger zone</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Cancellation preserves the tournament record and its configuration for future registration, payment, refund, and payout history.</p><div className="mt-5 max-w-sm"><CancelTournamentButton tournamentId={tournament.id} disabled={!canCancel} /></div>{!canCancel ? <p className="mt-3 text-xs text-slate-600">{tournament.status === TournamentStatus.COMPLETED ? "Completed tournaments cannot be cancelled." : "This tournament is already cancelled."}</p> : null}</section>
    </SectionContainer>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-black/10 p-4"><dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{label}</dt><dd className="mt-2 break-words text-sm text-slate-300">{children}</dd></div>;
}
