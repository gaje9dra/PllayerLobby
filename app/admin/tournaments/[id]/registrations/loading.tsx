import { SectionContainer } from "@/components/ui/section-container";

export default function Loading() {
  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-72 rounded-lg bg-white/10" />
        <div className="h-24 rounded-2xl bg-white/[0.04]" />
        <div className="h-16 rounded-2xl bg-white/[0.04]" />
        <div className="h-80 rounded-2xl bg-white/[0.04]" />
      </div>
    </SectionContainer>
  );
}
