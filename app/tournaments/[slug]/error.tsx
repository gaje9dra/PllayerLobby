"use client";

import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";

export default function TournamentDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionContainer className="py-20 sm:py-28">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.025] px-6 py-14 text-center sm:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Tournament</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Unable to load tournament</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">Something went wrong while loading this tournament. Please try again.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={reset}>Try again</Button>
          <Button href="/tournaments" variant="secondary">View Tournaments</Button>
        </div>
      </div>
    </SectionContainer>
  );
}
