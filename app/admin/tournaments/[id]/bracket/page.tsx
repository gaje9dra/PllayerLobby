import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GenerateBracketButton } from "./generate-button";
import { getTournamentBracket } from "@/lib/brackets";

export default async function AdminTournamentBracketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true, status: true, maxParticipants: true } });
  if (!tournament) notFound();
  const confirmed = await prisma.registration.count({ where: { tournamentId: id, status: "CONFIRMED" } });
  const data = await getTournamentBracket(id);
  const matchById = new Map(data?.matches.map((match) => [match.id, match]) ?? []);
  type BracketSlot = NonNullable<typeof data>["slots"][number];
  const slotsByMatch = new Map<string, BracketSlot[]>();
  for (const slot of data?.slots ?? []) slotsByMatch.set(slot.matchId, [...(slotsByMatch.get(slot.matchId) ?? []), slot]);

  return (
    <SectionContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-lime-300">Tournament bracket</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">{tournament.name}</h1><p className="mt-2 text-sm text-slate-500">{confirmed} confirmed participant{confirmed === 1 ? "" : "s"} · {data?.bracket.format.replaceAll("_", " ") ?? "Not generated"}</p></div>
        <Button href={`/admin/tournaments/${id}`} variant="secondary">Back to Tournament</Button>
      </div>

      {!data ? (
        <section className="mt-8 rounded-2xl border border-lime-300/15 bg-lime-300/[0.03] p-6">
          <h2 className="text-lg font-bold text-white">Generate bracket</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Only confirmed registrations are included. Generation is atomic and idempotent, and it does not touch wallet, payments, ledger, or registration records.</p>
          <div className="mt-5"><GenerateBracketButton tournamentId={id} participantCount={confirmed} /></div>
          {confirmed < 2 ? <p className="mt-3 text-xs text-amber-300">At least 2 confirmed participants are required.</p> : null}
        </section>
      ) : (
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-white">{data.bracket.format.replaceAll("_", " ")}</h2><p className="text-sm text-slate-500">Status: {data.bracket.status}</p></div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Assignments are locked</p></div>
          <div className="mt-7 grid gap-5 xl:grid-cols-3">
            {data.rounds.map((round) => (
              <section key={round.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-lime-300">{round.name}</h3>
                <div className="mt-4 space-y-3">
                  {data.matches.filter((match) => match.roundId === round.id).map((match) => {
                    const slots = slotsByMatch.get(match.id) ?? [];
                    return <div key={match.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><div className="flex items-center justify-between text-xs text-slate-600"><span>Match {match.matchNumber}</span><span>{match.status}</span></div><div className="mt-3 space-y-2">{[1, 2].map((slotNumber) => { const slot = slots.find((item) => item.slotNumber === slotNumber); const source = slot?.sourceMatchId ? matchById.get(slot.sourceMatchId) : null; return <div key={slotNumber} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-sm"><span className="text-slate-300">{slot?.registrationId ? slot.participantName || "Participant" : source ? `Winner of Match ${source.matchNumber}` : slot?.isBye ? "BYE" : "TBD"}</span>{slot?.seed ? <span className="text-xs text-slate-600">Seed {slot.seed}</span> : null}</div>; })}</div><div className="mt-3"><Button href={`/admin/tournaments/${id}/bracket/${match.id}/room`} variant="secondary" className="w-full">Manage Room</Button></div></div>;
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </SectionContainer>
  );
}
