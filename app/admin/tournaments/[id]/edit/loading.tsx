import { SectionContainer } from "@/components/ui/section-container";

export default function EditTournamentLoading() {
  return (
    <SectionContainer className="py-10 sm:py-14" aria-busy="true" aria-label="Loading tournament editor">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-white/10" />
      <div className="mt-8 grid gap-6">
        {[1, 2, 3, 4].map((item) => <div key={item} className="h-72 animate-pulse rounded-2xl bg-white/5" />)}
      </div>
    </SectionContainer>
  );
}
