import { SectionContainer } from "@/components/ui/section-container";

export default function Loading() {
  return (
    <SectionContainer className="py-12 sm:py-16">
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading page">
        <div className="h-3 w-28 rounded-full bg-white/10" />
        <div className="h-10 w-2/3 max-w-xl rounded-xl bg-white/10" />
        <div className="h-4 w-full max-w-2xl rounded-full bg-white/5" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
              <div className="aspect-[16/8] bg-white/5" />
              <div className="space-y-3 p-5">
                <div className="h-4 w-3/4 rounded-full bg-white/10" />
                <div className="h-3 w-1/2 rounded-full bg-white/5" />
                <div className="h-10 rounded-xl bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionContainer>
  );
}
