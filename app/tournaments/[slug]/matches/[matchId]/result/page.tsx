import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { getMatchResult } from "@/lib/match-results";

export default async function ParticipantMatchResultPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  const { slug, matchId } = await params;
  const result = await getMatchResult(matchId);
  if (!result.ok) notFound();
  const data = result.data;
  if (!data) notFound();
  return <SectionContainer><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-lime-300">Match result</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">Match {data.match.matchNumber}</h1></div><Button href={`/tournaments/${slug}/bracket`} variant="secondary">Back to Bracket</Button></div><section className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><div className="space-y-3">{data.results.map((item) => <article key={String(item.id)} className="rounded-xl border border-white/10 p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{String(item.status)}</span>{item.verifiedAt ? <span className="text-xs text-lime-300">Verified</span> : null}</div><p className="mt-3 text-sm text-slate-300">Winner: {String(item.winnerRegistrationId ?? "Pending")}</p><pre className="mt-3 overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-slate-400">{JSON.stringify(item.scores, null, 2)}</pre>{item.status === "REJECTED" && item.rejectionReason ? <p className="mt-3 text-xs text-amber-200">Result rejected.</p> : null}</article>)}</div>{data.results.length === 0 ? <p className="text-sm text-slate-400">RESULT PENDING</p> : null}</section></SectionContainer>;
}
