import { SectionContainer } from "@/components/ui/section-container";

export default function DashboardLoading() {
  return (
    <SectionContainer className="py-12 sm:py-16 lg:py-20" aria-label="Loading dashboard">
      <div className="animate-pulse space-y-8">
        <div className="space-y-4 border-b border-white/10 pb-8">
          <div className="h-3 w-32 rounded bg-white/10" />
          <div className="h-10 w-2/3 rounded bg-white/10" />
          <div className="h-4 w-full max-w-2xl rounded bg-white/5" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="h-64 rounded-2xl border border-white/10 bg-white/[0.02]" />
          <div className="h-64 rounded-2xl border border-white/10 bg-white/[0.02]" />
        </div>
      </div>
    </SectionContainer>
  );
}
