"use client";

import { useEffect, useMemo, useState } from "react";
import type { AviatorRoundSnapshot } from "@/lib/games/aviator/types";

type HistoryItem = { id: string; crashMultiplier: string | number | null; crashedAt: string | null };

const initial: AviatorRoundSnapshot = {
  roundId: "loading",
  phase: "WAITING",
  serverTime: 0,
  multiplier: 1,
  startedAt: null,
  waitingEndsAt: null,
};

export function AviatorGame() {
  const [snapshot, setSnapshot] = useState(initial);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [connection, setConnection] = useState("Connecting...");
  const [clientNow, setClientNow] = useState(0);

  useEffect(() => {
    setClientNow(Date.now());
    const clock = window.setInterval(() => setClientNow(Date.now()), 100);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let active = true;

    const loadCurrent = async () => {
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

    const loadHistory = async () => {
      try {
        const response = await fetch("/api/games/aviator/history", { cache: "no-store" });
        if (response.ok && active) setHistory((await response.json()) as HistoryItem[]);
      } catch {
        // History is supplementary; keep the live round available.
      }
    };

    const connect = () => {
      source = new EventSource("/api/games/aviator/stream");
      source.onopen = () => setConnection("Connected");
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type: string; snapshot: AviatorRoundSnapshot };
          if (payload.snapshot) setSnapshot(payload.snapshot);
          if (payload.type === "round:settled" || payload.type === "round:crashed") void loadHistory();
        } catch {
          setConnection("Disconnected");
        }
      };
      source.onerror = () => setConnection("Connecting...");
    };

    void loadCurrent();
    void loadHistory();
    connect();

    return () => {
      active = false;
      source?.close();
    };
  }, []);

  const status = useMemo(() => {
    if (snapshot.phase === "WAITING") return "Next round starting soon";
    if (snapshot.phase === "RUNNING") return "Round running";
    if (snapshot.phase === "CRASHED") return "Crashed";
    return "Round settled";
  }, [snapshot.phase]);

  const countdown = snapshot.phase === "WAITING" && snapshot.waitingEndsAt && clientNow
    ? Math.max(0, (snapshot.waitingEndsAt - clientNow) / 1000).toFixed(1)
    : null;

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
        <div className={`flex min-h-[360px] flex-col items-center justify-center rounded-2xl border bg-white/[0.025] text-center transition-colors duration-200 ${snapshot.phase === "CRASHED" ? "border-red-400/30" : "border-white/5"}`}>
          <p className="text-sm font-semibold text-slate-400">{status}</p>
          {countdown ? <p className="mt-3 text-lg font-bold text-slate-300">Starting in {countdown}s</p> : null}
          <div className={`my-5 text-7xl font-black tracking-tight tabular-nums transition-transform duration-200 sm:text-8xl ${snapshot.phase === "CRASHED" ? "scale-105 text-red-300" : "text-white"}`}>
            {snapshot.multiplier.toFixed(2)}x
          </div>
          <p className="text-xs text-slate-500">Round {snapshot.roundId}</p>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
        <h2 className="text-lg font-bold text-white">Recent rounds</h2>
        <p className="mt-2 text-sm text-slate-500">Historical results only; previous rounds do not predict future outcomes.</p>
        <div className="mt-5 flex flex-wrap gap-3" aria-label="Recent rounds">
          {history.length ? history.map((round) => (
            <span key={round.id} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300">
              {Number(round.crashMultiplier ?? 1).toFixed(2)}x
            </span>
          )) : <span className="text-sm text-slate-500">No completed rounds yet.</span>}
        </div>
      </section>
    </main>
  );
}
