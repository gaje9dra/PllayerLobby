import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";

export default async function TournamentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await params;

  return (
    <SectionContainer className="py-20 sm:py-28">
      <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center sm:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Tournament</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">Tournament system coming soon.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-500">Tournament details will be loaded here when tournament management is introduced.</p>
        <Button href="/tournaments" variant="secondary" className="mt-7">View Tournaments</Button>
      </div>
    </SectionContainer>
  );
}
