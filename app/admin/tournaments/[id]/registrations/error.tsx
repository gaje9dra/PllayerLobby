"use client";

import { useEffect } from "react";
import { SectionContainer } from "@/components/ui/section-container";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Admin registration management error:", error);
  }, [error]);

  return (
    <SectionContainer className="py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-300">Registration management error</p>
        <h1 className="mt-3 text-2xl font-black text-white">Unable to load registrations</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Something went wrong while loading the administrative registration data.</p>
        <button onClick={() => reset()} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-200 hover:bg-white/5">Try again</button>
      </div>
    </SectionContainer>
  );
}
