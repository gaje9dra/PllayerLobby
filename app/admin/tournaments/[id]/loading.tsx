import { SectionContainer } from "@/components/ui/section-container";

export default function AdminTournamentDetailsLoading() {
  return (
    <SectionContainer className="py-10 sm:py-14" aria-busy="true" aria-label="Loading tournament">
      <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
      <div className="mt-5 h-12 w-2/3 animate-pulse rounded-xl bg-white/10" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-white/5" />)}
      </div>
    </SectionContainer>
  );
}
