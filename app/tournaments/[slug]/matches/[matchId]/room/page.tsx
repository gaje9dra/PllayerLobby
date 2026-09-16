import { SectionContainer } from "@/components/ui/section-container";
import { Button } from "@/components/ui/button";
import { MatchRoom } from "@/components/tournaments/match-room";

export default async function MatchRoomPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  const { slug, matchId } = await params;
  return (
    <SectionContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-lime-300">Your Match</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">Room Credentials</h1><p className="mt-2 text-sm text-slate-500">Private match access for your tournament.</p></div>
        <Button href={`/tournaments/${encodeURIComponent(slug)}/bracket`} variant="secondary">Back to Bracket</Button>
      </div>
      <section className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <MatchRoom matchId={matchId} />
      </section>
    </SectionContainer>
  );
}
