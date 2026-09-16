import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { MatchResultForm } from "@/components/admin/match-result-form";
import { MatchEdgeCaseActions } from "@/components/admin/match-edge-case-actions";
import { requireAdmin } from "@/lib/auth";
import { getMatchResult } from "@/lib/match-results";

export default async function AdminMatchResultPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  await requireAdmin();
  const { id, matchId } = await params;
  const result = await getMatchResult(matchId);
  if (!result.ok) notFound();
  const data = result.data;
  if (!data || data.match.tournamentId !== id) notFound();
  return <SectionContainer><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-lime-300">Match result</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">Match {data.match.matchNumber}</h1><p className="mt-2 text-sm text-slate-500">Submit a result for operator verification. Verification advances the winner atomically.</p></div><Button href={`/admin/tournaments/${id}/bracket`} variant="secondary">Back to Bracket</Button></div><section className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><MatchResultForm matchId={matchId} participants={data.participants} /><div className="mt-8 border-t border-white/10 pt-6"><h2 className="text-sm font-bold text-white">Result history</h2><div className="mt-3 space-y-2">{data.results.map((item) => <div key={String(item.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400"><span className="font-semibold text-white">{String(item.status)}</span> · winner {String(item.winnerRegistrationId ?? "pending")} · submitted {String(item.submitterName ?? "unknown")}</div>)}</div></div></section><MatchEdgeCaseActions tournamentId={id} matchId={matchId} participants={data.participants} status={String(data.match.matchStatus)} /></SectionContainer>;
}
