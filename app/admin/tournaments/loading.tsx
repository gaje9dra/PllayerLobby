import { SectionContainer } from "@/components/ui/section-container";

export default function AdminTournamentsLoading() {
  return (
    <SectionContainer className="py-10 sm:py-14" aria-busy="true" aria-label="Loading tournaments">
      <div className="h-10 w-56 animate-pulse rounded-xl bg-white/10" />
      <div className="mt-8 h-20 animate-pulse rounded-2xl bg-white/5" />
      <div className="mt-5 grid gap-4">
        {[1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-white/5" />)}
      </div>
    </SectionContainer>
  );
}
