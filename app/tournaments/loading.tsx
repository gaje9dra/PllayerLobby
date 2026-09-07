import { SectionContainer } from "@/components/ui/section-container";

export default function TournamentsLoading() {
  return (
    <SectionContainer className="py-10 sm:py-14" aria-busy="true">
      <div className="animate-pulse">
        <div className="h-3 w-28 rounded bg-white/10" />
        <div className="mt-3 h-10 w-56 rounded bg-white/10" />
        <div className="mt-3 h-5 w-full max-w-2xl rounded bg-white/5" />
        <div className="mt-8 h-24 rounded-2xl border border-white/10 bg-white/[0.025]" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
              <div className="aspect-[16/8] bg-white/5" />
              <div className="space-y-4 p-5">
                <div className="h-5 w-3/4 rounded bg-white/10" />
                <div className="h-4 w-full rounded bg-white/5" />
                <div className="h-16 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionContainer>
  );
}
