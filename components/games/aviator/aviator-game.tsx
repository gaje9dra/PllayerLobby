"use client";

import { useEffect, useMemo, useState } from "react";
import type { AviatorRoundSnapshot } from "@/lib/games/aviator/engine";

const initial: AviatorRoundSnapshot = {
  roundId: "loading",
  phase: "WAITING",
  serverTime: Date.now(),
  multiplier: 1,
  startedAt: null,
};

export function AviatorGame() {
  const [snapshot, setSnapshot] = useState(initial);
  const [connection, setConnection] = useState("Connecting...");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/games/aviator/round", { cache: "no-store" });
        if (!response.ok) throw new Error("round request failed");
        const next = (await response.json()) as AviatorRoundSnapshot;
        if (active) {
          setSnapshot(next);
          setConnection("Connected");
        }
      } catch {
        if (active) setConnection("Disconnected");
      }
    };
    void load();
    const interval = window.setInterval(load, 500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const status = useMemo(() => {
    if (snapshot.phase === "WAITING") return "Next round starting soon";
    if (snapshot.phase === "RUNNING") return "Round running";
    if (snapshot.phase === "CRASHED") return "Crashed";
    return "Round settled";
  }, [snapshot.phase]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Games</p>
          <h1 className="mt-2 text-3xl font-black text-white">Aviator</h1>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{connection}</span>
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl sm:p-10">
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.025] text-center">
          <p className="text-sm font-semibold text-slate-400">{status}</p>
          <div className="my-5 text-7xl font-black tracking-tight text-white tabular-nums sm:text-8xl">
            {snapshot.multiplier.toFixed(2)}x
          </div>
          <p className="text-xs text-slate-500">Round {snapshot.roundId}</p>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
        <h2 className="text-lg font-bold text-white">Recent rounds</h2>
        <p className="mt-2 text-sm text-slate-500">Historical results only; previous rounds do not predict future outcomes.</p>
        <div className="mt-5 flex flex-wrap gap-3" aria-label="Recent rounds">
          <span className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300">Live round</span>
        </div>
      </section>
    </main>
  );
}
