import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { getPublicTournamentBracketBySlug } from "@/lib/brackets";

export default async function TournamentBracketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicTournamentBracketBySlug(slug);
  if (!data) notFound();
  const matchById = new Map(data.matches.map((match) => [match.id, match]));
  const slotsByMatch = new Map<string, typeof data.slots>();
  for (const slot of data.slots) slotsByMatch.set(slot.matchId, [...(slotsByMatch.get(slot.matchId) ?? []), slot]);

  return (
    <SectionContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-lime-300">Tournament bracket</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">{data.tournament.name}</h1><p className="mt-2 text-sm text-slate-500">{data.bracket.format.replaceAll("_", " ")}</p></div><Button href={`/tournaments/${data.tournament.slug}`} variant="secondary">Back to Tournament</Button></div>
      <div className="mt-8 grid gap-5 xl:grid-cols-3">
        {data.rounds.map((round) => (
          <section key={round.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><h2 className="text-sm font-black uppercase tracking-[0.16em] text-lime-300">{round.name}</h2><div className="mt-4 space-y-3">{data.matches.filter((match) => match.roundId === round.id).map((match) => { const slots = slotsByMatch.get(match.id) ?? []; return <article key={match.id} className="rounded-xl border border-white/10 bg-black/10 p-3"><div className="flex items-center justify-between text-xs text-slate-600"><span>Match {match.matchNumber}</span><span>{match.status}</span></div><div className="mt-3 space-y-2">{[1,2].map((slotNumber) => { const slot = slots.find((item) => item.slotNumber === slotNumber); const source = slot?.sourceMatchId ? matchById.get(slot.sourceMatchId) : null; return <div key={slotNumber} className="rounded-lg border border-white/5 px-3 py-2 text-sm text-slate-300">{slot?.registrationId ? slot.participantName || "Participant" : source ? `Winner of Match ${source.matchNumber}` : slot?.isBye ? "BYE" : "TBD"}</div>; })}</div><div className="mt-3"><Button href={`/tournaments/${encodeURIComponent(data.tournament.slug)}/matches/${match.id}/room`} variant="secondary" className="w-full">Your Match Room</Button></div></article>; })}</div></section>
        ))}
      </div>
    </SectionContainer>
  );
}
