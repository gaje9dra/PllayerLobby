import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPrizeSummary, getTournamentPrizes } from "@/lib/tournament-prize";
import { CreatePrizeForm } from "./create-prize-form";
import { FinalizePrizeForm } from "./finalize-prize-form";
import { PrizePreview } from "./preview";
import { PrizeRow } from "./prize-row";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminTournamentPrizesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true, prizePool: true, status: true } });
  if (!tournament) notFound();
  const [prizes, summary] = await Promise.all([getTournamentPrizes(id), getPrizeSummary(id)]);
  const finalized = prizes.length > 0 && prizes.every((prize) => prize.status === "FINALIZED");
  const canEdit = !finalized && tournament.status !== "CANCELLED";

  return <SectionContainer className="py-10 sm:py-14">
    <Link href={`/admin/tournaments/${id}`} className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Tournament</Link>
    <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Prizes · {tournament.name}</h1><p className="mt-2 text-sm text-slate-400">Configure official prize positions. This phase records allocations only; no money is paid.</p></div><div className="flex flex-wrap gap-2"><Button href={`/admin/tournaments/${id}/results`} variant="secondary">Results</Button><Button href={`/admin/tournaments/${id}`} variant="secondary">Tournament</Button></div></div>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Prize Pool" value={`₹${summary.prizePool}`} /><Metric label="Allocated" value={`₹${summary.allocated}`} /><Metric label="Remaining" value={`₹${summary.remaining}`} /><Metric label="Status" value={finalized ? "FINALIZED" : "DRAFT"} /></section>
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-white">Prize positions</h2><p className="mt-1 text-sm text-slate-500">Ranks are unique within this tournament and amounts are calculated server-side.</p></div>{finalized ? <span className="w-fit rounded-full bg-lime-300/10 px-3 py-1 text-xs font-bold text-lime-200">FINALIZED · LOCKED</span> : null}</div><div className="mt-5 space-y-3">{prizes.length > 0 ? prizes.map((prize) => <PrizeRow key={prize.id} tournamentId={id} prize={{ id: prize.id, rank: prize.rank, amount: prize.amount.toString(), status: prize.status }} />) : <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">No prize positions configured yet.</p>}</div></section>
    {canEdit ? <section className="mt-6"><CreatePrizeForm tournamentId={id} /></section> : null}
    {!finalized && tournament.status === "CANCELLED" ? <section className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-200">This tournament is cancelled. Existing draft prize history is preserved and cannot be finalized.</section> : null}
    {!finalized ? <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><div><h2 className="text-lg font-bold text-white">Finalize configuration</h2><p className="mt-1 text-sm leading-6 text-slate-500">Finalization requires at least one prize and an allocation exactly equal to the tournament prize pool. Once finalized, ordinary editing is locked.</p></div><div className="mt-5"><FinalizePrizeForm tournamentId={id} disabled={prizes.length === 0 || summary.remaining !== "0.00" || tournament.status === "CANCELLED"} /></div></section> : null}
    {finalized ? <PrizePreview tournamentId={id} /> : null}
  </SectionContainer>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{label}</p><p className="mt-2 text-2xl font-black text-white">{value}</p></div>; }
