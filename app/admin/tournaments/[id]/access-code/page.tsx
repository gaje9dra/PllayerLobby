import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TournamentAccessCodeManager } from "@/components/admin/tournament-access-code-manager";

export const dynamic = "force-dynamic";

export default async function TournamentAccessCodePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!tournament) notFound();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div>
        <Link href={`/admin/tournaments/${encodeURIComponent(id)}`} className="text-sm font-semibold text-slate-400 hover:text-white">← Back to tournament</Link>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tournament.status}</p>
        <h1 className="mt-2 text-3xl font-black text-white">{tournament.name}</h1>
      </div>
      <TournamentAccessCodeManager tournamentId={tournament.id} />
    </main>
  );
}
