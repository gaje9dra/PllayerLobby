import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { MatchResultActions } from "@/components/admin/match-result-actions";
import { requireAdmin } from "@/lib/auth";
import { listPendingMatchResults } from "@/lib/match-results";
import { prisma } from "@/lib/prisma";

export default async function AdminMatchResultsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!tournament) notFound();
  const results = await listPendingMatchResults(id);
  return <SectionContainer><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-lime-300">Match results</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">{tournament.name}</h1><p className="mt-2 text-sm text-slate-500">Pending and disputed results requiring operator review.</p></div><Button href={`/admin/tournaments/${id}/bracket`} variant="secondary">Back to Bracket</Button></div><section className="mt-8 space-y-4">{results.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-sm text-slate-400">No pending results.</div> : results.map((result) => <article key={String(result.id)} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-white">Round {String(result.roundNumber)} · Match {String(result.matchNumber)}</p><p className="mt-1 text-xs text-slate-500">Submitted by {String(result.submitterName ?? "Administrator")} · {String(result.status)}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{String(result.status)}</span></div><pre className="mt-4 overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-slate-300">{JSON.stringify(result.scores, null, 2)}</pre><p className="mt-3 text-xs text-slate-500">Proposed winner: {String(result.winnerRegistrationId)}</p><MatchResultActions matchId={String(result.matchId)} resultId={String(result.id)} status={String(result.status)} /></article>)}</section></SectionContainer>;
}
