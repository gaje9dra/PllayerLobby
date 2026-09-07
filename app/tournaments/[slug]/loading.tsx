import { SectionContainer } from "@/components/ui/section-container";

export default function TournamentDetailLoading() {
  return (
    <SectionContainer className="py-8 sm:py-12" aria-busy="true">
      <div className="animate-pulse">
        <div className="h-11 w-44 rounded-xl bg-white/10" />
        <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025]">
          <div className="min-h-[300px] bg-white/5 sm:min-h-[380px]" />
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 rounded-2xl bg-white/5" />)}
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="space-y-6">
            <div className="h-64 rounded-3xl bg-white/5" />
            <div className="h-72 rounded-3xl bg-white/5" />
          </div>
          <div className="space-y-6">
            <div className="h-72 rounded-3xl bg-white/5" />
            <div className="h-72 rounded-3xl bg-white/5" />
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
