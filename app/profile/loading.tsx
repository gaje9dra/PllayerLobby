import { SectionContainer } from "@/components/ui/section-container";

export default function ProfileLoading() {
  return (
    <SectionContainer className="py-12 sm:py-16 lg:py-20" aria-label="Loading profile">
      <div className="animate-pulse space-y-8">
        <div className="space-y-4 border-b border-white/10 pb-8">
          <div className="h-3 w-28 rounded bg-white/10" />
          <div className="h-10 w-40 rounded bg-white/10" />
        </div>
        <div className="h-80 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.02]" />
      </div>
    </SectionContainer>
  );
}
