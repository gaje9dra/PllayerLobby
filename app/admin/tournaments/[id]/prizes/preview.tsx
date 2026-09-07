import { calculateTournamentPrizes } from "@/lib/tournament-prize";

export async function PrizePreview({ tournamentId }: { tournamentId: string }) {
  const allocations = await calculateTournamentPrizes(tournamentId);
  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h2 className="text-lg font-bold text-white">Allocation Preview</h2><div className="mt-4 space-y-2">{allocations.map((item) => <div key={item.rank} className="flex items-center justify-between gap-4 rounded-lg border border-white/5 px-4 py-3"><span className="text-sm text-slate-300">#{item.rank}</span><span className="text-sm text-white">₹{item.amount}</span><span className="text-sm text-slate-500">{item.participant ? item.participant.name || item.participant.email : "No verified winner"}</span></div>)}</div></section>;
}
