import { SectionContainer } from "@/components/ui/section-container";

export default function Loading() {
  return <SectionContainer className="py-10 sm:py-14"><div className="animate-pulse space-y-5"><div className="h-4 w-20 rounded bg-white/10" /><div className="h-10 w-72 rounded bg-white/10" /><div className="h-72 rounded-2xl border border-white/10 bg-white/[0.025]" /></div></SectionContainer>;
}
