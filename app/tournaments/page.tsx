import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";

export default function TournamentsPage() {
  return (
    <SectionContainer className="py-20 sm:py-28">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Tournaments</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">Compete when the arena opens.</h1>
        <p className="mt-5 text-base leading-7 text-slate-400">The tournament catalog is being prepared. Real tournament data will be connected in a later phase.</p>
      </div>
      <div className="mt-12 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-lime-300/10 text-xl text-lime-300">—</div>
        <h2 className="mt-5 text-xl font-bold text-white">Tournament system coming soon</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">No tournament records are displayed yet.</p>
        <Button href="/" variant="secondary" className="mt-7">Back to Home</Button>
      </div>
    </SectionContainer>
  );
}
