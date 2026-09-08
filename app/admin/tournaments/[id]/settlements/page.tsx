import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { previewPrizeSettlements, getTournamentSettlementSummary, getTournamentSettlements, reconcileTournamentSettlement } from "@/lib/tournament-prize-settlement";
import { GenerateSettlementsForm, SettlementRowActions } from "./settlement-actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminTournamentSettlementsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [summary, preview, settlements, reconciliation] = await Promise.all([
    getTournamentSettlementSummary(id), previewPrizeSettlements(id), getTournamentSettlements(id), reconcileTournamentSettlement(id),
  ]);
  const { tournament } = summary;
  const finalized = tournament.prizes.length > 0 && tournament.prizes.every((p) => p.status === "FINALIZED");
  const unassigned = preview.filter((p) => !p.eligible);
  const pending = settlements.filter((s) => s.status === "PENDING").length;
  const approved = settlements.filter((s) => s.status === "APPROVED").length;
  const cancelled = settlements.filter((s) => s.status === "CANCELLED").length;
  const canGenerate = tournament.status === "COMPLETED" && finalized && reconciliation.errors.length === 0;
  return <SectionContainer className="py-10 sm:py-14">
    <Link href={`/admin/tournaments/${id}`} className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Tournament</Link>
    <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Settlements · {tournament.name}</h1><p className="mt-2 text-sm leading-6 text-slate-400">Prepare and approve prize entitlements. Approval does not mean money has been paid.</p></div><div className="flex flex-wrap gap-2"><Button href={`/admin/tournaments/${id}/prizes`} variant="secondary">Prizes</Button><Button href={`/admin/tournaments/${id}/results`} variant="secondary">Results</Button></div></div>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Tournament" value={tournament.status} /><Metric label="Prize Config" value={finalized ? "FINALIZED" : "DRAFT"} /><Metric label="Potential Prizes" value={`₹${summary.totalPotential}`} /><Metric label="Generated" value={`₹${summary.totalGenerated}`} /></section>
    <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Pending" value={String(pending)} /><Metric label="Approved" value={String(approved)} /><Metric label="Cancelled" value={String(cancelled)} /><Metric label="Unassigned" value={`₹${summary.unassignedApproximation}`} /></section>
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">Settlement preview</h2><p className="mt-1 text-sm text-slate-500">Read-only preview. No settlement records are created here.</p><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-3 py-2">Rank</th><th className="px-3 py-2">Participant</th><th className="px-3 py-2">Registration</th><th className="px-3 py-2">Prize</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reason</th></tr></thead><tbody>{preview.map((row) => <tr key={row.rank} className="border-t border-white/5"><td className="px-3 py-3 font-bold text-white">{row.rank}</td><td className="px-3 py-3 text-slate-300">{row.participant ? `${row.participant.name || "Unnamed"} · ${row.participant.email}` : "—"}</td><td className="px-3 py-3 font-mono text-xs text-slate-500">{row.registrationId || "—"}</td><td className="px-3 py-3 text-white">₹{row.amount}</td><td className={`px-3 py-3 font-bold ${row.eligible ? "text-lime-200" : "text-amber-200"}`}>{row.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</td><td className="px-3 py-3 text-xs text-slate-500">{row.reason || "—"}</td></tr>)}</tbody></table></div></section>
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-white">Generate settlements</h2><p className="mt-1 text-sm text-slate-500">Only completed tournaments with finalized, pool-matching prizes can generate official PENDING entitlements.</p></div><GenerateSettlementsForm tournamentId={id} disabled={!canGenerate} /></div>{unassigned.length ? <p className="mt-4 text-sm text-amber-200">Unassigned prize positions: {unassigned.map((p) => `${p.rank} — ₹${p.amount}`).join(", ")}</p> : null}</section>
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">Settlement records</h2>{settlements.length ? <div className="mt-5 space-y-3">{settlements.map((s) => <div key={s.id} className="rounded-xl border border-white/10 p-4"><div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-bold text-white">Rank {s.rank} · {s.registration.user.name || "Unnamed"}</p><p className="mt-1 text-sm text-slate-400">{s.registration.user.email} · ₹{s.amount.toString()} {s.currency} · Result {s.result.resultStatus}</p><p className="mt-1 font-mono text-xs text-slate-600">Settlement {s.id}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${s.status === "APPROVED" ? "bg-lime-300/10 text-lime-200" : s.status === "CANCELLED" ? "bg-rose-300/10 text-rose-200" : "bg-amber-300/10 text-amber-200"}`}>{s.status}</span><SettlementRowActions tournamentId={id} settlementId={s.id} status={s.status} /></div></div></div>)}</div> : <p className="mt-4 text-sm text-slate-500">No settlement records generated.</p>}</section>
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.025] p-5"><h2 className="font-bold text-white">Reconciliation</h2><p className="mt-2 text-sm text-slate-400">{reconciliation.ok ? "No settlement integrity errors detected." : reconciliation.errors.join(" · ")}</p>{reconciliation.warnings.map((w) => <p key={w} className="mt-2 text-xs text-amber-200">{w}</p>)}</section>
  </SectionContainer>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{label}</p><p className="mt-2 text-2xl font-black text-white">{value}</p></div>; }
