import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TournamentForm } from "@/app/admin/tournaments/form";
import { SectionContainer } from "@/components/ui/section-container";

export default async function CreateTournamentPage() {
  await requireAdmin();

  const games = await prisma.game.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Administration / Tournaments</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Create Tournament</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Configure a tournament before publishing it. New tournaments are saved as drafts.</p>
      </div>
      {games.length === 0 ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-6 text-sm text-amber-100">
          No active games are available. Activate a game before creating a tournament.
        </div>
      ) : (
        <TournamentForm games={games} />
      )}
    </SectionContainer>
  );
}
