import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { MatchRoomForm } from "@/components/admin/match-room-form";
import { requireAdmin } from "@/lib/auth";
import { getAdminMatchRoom } from "@/lib/match-room";

export default async function AdminMatchRoomPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  await requireAdmin();
  const { id, matchId } = await params;
  const room = await getAdminMatchRoom(matchId);
  if (!room || room.tournamentId !== id) notFound();

  return (
    <SectionContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-lime-300">Match room</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">{room.tournamentName}</h1><p className="mt-2 text-sm text-slate-500">Configure private credentials for match {matchId}</p></div>
        <Button href={`/admin/tournaments/${id}/bracket`} variant="secondary">Back to Bracket</Button>
      </div>
      <section className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <MatchRoomForm matchId={matchId} />
      </section>
    </SectionContainer>
  );
}
