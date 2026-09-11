"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep production error details out of the UI; the framework/server logs retain the diagnostic context.
  }, []);

  return (
    <SectionContainer className="py-16 sm:py-24">
      <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.025] p-8 text-center shadow-2xl shadow-black/20 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">500 · Something went wrong</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">We could not load this page.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Please try again. If the problem continues, come back later.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={reset}>Try again</Button>
          <Button href="/" variant="secondary">Back to Home</Button>
        </div>
      </section>
    </SectionContainer>
  );
}
