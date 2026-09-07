import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminTournamentPrizesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { id: true, name: true, prizePool: true },
  });
  if (!tournament) notFound();
  return (
    <SectionContainer className="py-10 sm:py-14">
      <Link href={`/admin/tournaments/${id}`} className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Tournament</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black text-white sm:text-4xl">Prizes · {tournament.name}</h1><p className="mt-2 text-sm text-slate-400">Prize configuration foundation. No money is paid from this page.</p></div>
        <Button href={`/admin/tournaments/${id}/results`} variant="secondary">Results</Button>
      </div>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-6">
        <p className="text-sm text-slate-500">Configured prize pool</p>
        <p className="mt-1 text-3xl font-black text-white">₹{tournament.prizePool.toFixed(2)}</p>
        <p className="mt-3 text-sm text-amber-200">Prize management UI is being added in the next implementation step.</p>
      </div>
    </SectionContainer>
  );
}
