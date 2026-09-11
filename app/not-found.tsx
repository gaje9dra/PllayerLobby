import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";

export default function NotFound() {
  return (
    <SectionContainer className="py-16 sm:py-24">
      <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.025] p-8 text-center shadow-2xl shadow-black/20 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">404 · Not found</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">That page does not exist.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">The link may be outdated, or the tournament may no longer be publicly available.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href="/">Back to Home</Button>
          <Button href="/tournaments" variant="secondary">Browse Tournaments</Button>
        </div>
      </section>
    </SectionContainer>
  );
}
