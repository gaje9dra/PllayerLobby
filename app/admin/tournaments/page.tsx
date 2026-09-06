import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatAppDateTime } from "@/lib/timezone";
import { SectionContainer } from "@/components/ui/section-container";
import { Button } from "@/components/ui/button";

export default async function AdminTournamentsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  await requireAdmin();
  const { created } = await searchParams;
  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      startTime: true,
      registrationStartTime: true,
      registrationEndTime: true,
      entryFee: true,
      prizePool: true,
      maxParticipants: true,
      status: true,
      tournamentFormat: true,
      region: true,
      game: { select: { name: true } },
    },
  });

  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Administration</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Tournaments</h1>
          <p className="mt-2 text-sm text-slate-400">Create and review tournament configurations.</p>
        </div>
        <Button href="/admin/tournaments/create">Create Tournament</Button>
      </div>

      {created === "1" ? (
        <div role="status" className="mt-6 rounded-xl border border-lime-300/20 bg-lime-300/10 px-4 py-3 text-sm font-medium text-lime-200">
          Tournament created successfully as a draft.
        </div>
      ) : null}

      {tournaments.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <p className="text-lg font-bold text-white">No tournaments created yet.</p>
          <p className="mt-2 text-sm text-slate-500">Create your first tournament to see it here.</p>
          <Button href="/admin/tournaments/create" className="mt-6">Create Tournament</Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {tournaments.map((tournament) => (
            <article key={tournament.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-white">{tournament.name}</h2>
                    <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-200">{tournament.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{tournament.game.name} · {tournament.tournamentFormat} · {tournament.region}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-300">Starts {formatAppDateTime(tournament.startTime)}</p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-4">
                <div><dt className="text-xs text-slate-600">Registration</dt><dd className="mt-1 text-sm text-slate-300">{tournament.registrationStartTime ? formatAppDateTime(tournament.registrationStartTime) : "—"}</dd><dd className="text-sm text-slate-500">to {tournament.registrationEndTime ? formatAppDateTime(tournament.registrationEndTime) : "—"}</dd></div>
                <div><dt className="text-xs text-slate-600">Entry fee</dt><dd className="mt-1 text-sm font-semibold text-white">₹{tournament.entryFee.toFixed(2)}</dd></div>
                <div><dt className="text-xs text-slate-600">Prize pool</dt><dd className="mt-1 text-sm font-semibold text-white">₹{tournament.prizePool.toFixed(2)}</dd></div>
                <div><dt className="text-xs text-slate-600">Max participants</dt><dd className="mt-1 text-sm font-semibold text-white">{tournament.maxParticipants?.toLocaleString() ?? "—"}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </SectionContainer>
  );
}
