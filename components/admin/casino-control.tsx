"use client";

import { useCallback, useEffect, useState } from "react";

type CasinoData = {
  round: { id: string; phase: string; multiplier: number; serverTime: number; startedAt: number | null };
  summary: { users: number; bets: number; totalStake: string; totalPayout: string; activeBets: number; activeStake: string };
  users: Array<{ userId: string; name: string; email: string; bets: number; stake: string; payout: string }>;
  recentBets: Array<{ id: string; userId: string; player: string; stake: string; status: string; payout: string; placedAt: string }>;
};

const money = (value: string | number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));

export function CasinoControl() {
  const [data, setData] = useState<CasinoData | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/casino-control", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Admin access required." : "Could not load live round data.");
      const payload = (await response.json()) as CasinoData;
      setData(payload);
      setUpdatedAt(new Date());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load live round data.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-lime-300">Live casino operations</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">Casino control</h1><p className="mt-2 text-sm text-slate-400">Monitor player participation and wager volume in the current Aviator round.</p></div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-xs font-semibold text-emerald-300"><span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Auto-refresh · 3 sec</div>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-300">{error}</p>}
        {data ? <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-4">
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current round ID</p><p className="mt-1 font-mono text-xs text-slate-300">{data.round.id}</p></div>
            <div className="flex items-center gap-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Round status</p><p className="mt-1 text-sm font-bold text-white">{data.round.phase}</p></div>{data.round.phase === "RUNNING" && <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Multiplier</p><p className="mt-1 text-lg font-black text-lime-300">{data.round.multiplier.toFixed(2)}x</p></div>}</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Players this round" value={data.summary.users.toLocaleString("en-IN")} note="Unique users with a bet" />
            <Metric label="Total bets" value={data.summary.bets.toLocaleString("en-IN")} note="All bets placed this round" />
            <Metric label="Total wagered" value={money(data.summary.totalStake)} note="Combined stake amount" />
            <Metric label="Currently active" value={money(data.summary.activeStake)} note={`${data.summary.activeBets} unsettled bets`} />
          </div>
        </> : !error && <div className="mt-6 animate-pulse rounded-xl bg-white/[0.04] p-12 text-center text-sm text-slate-500">Loading live round data…</div>}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-600"><span>Read-only monitoring · no wallet or bet controls</span><span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : "Waiting for data"}</span></div>
      </section>

      {data && <>
        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Player exposure</p><h2 className="mt-2 text-xl font-black text-white">Bets by player</h2></div><p className="text-xs text-slate-500">{data.users.length} players in this round</p></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="pb-3 pr-4">Player</th><th className="pb-3 px-4 text-right">Bets</th><th className="pb-3 px-4 text-right">Total wagered</th><th className="pb-3 pl-4 text-right">Payout credited</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{data.users.map((user) => <tr key={user.userId}><td className="py-3 pr-4"><p className="font-semibold text-white">{user.name}</p><p className="mt-0.5 text-xs text-slate-500">{user.email || user.userId}</p></td><td className="px-4 py-3 text-right tabular-nums text-slate-300">{user.bets}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-white">{money(user.stake)}</td><td className="pl-4 py-3 text-right tabular-nums text-slate-300">{money(user.payout)}</td></tr>)}</tbody></table>{data.users.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No bets placed in this round yet.</p>}</div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Round activity</p><h2 className="mt-2 text-xl font-black text-white">Recent bets</h2></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="pb-3 pr-4">Player</th><th className="pb-3 px-4 text-right">Stake</th><th className="pb-3 px-4 text-center">Status</th><th className="pb-3 px-4 text-right">Payout</th><th className="pb-3 pl-4 text-right">Placed at</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{data.recentBets.map((bet) => <tr key={bet.id}><td className="py-3 pr-4 font-semibold text-white">{bet.player}</td><td className="px-4 py-3 text-right tabular-nums text-slate-300">{money(bet.stake)}</td><td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${bet.status === "ACTIVE" ? "bg-amber-300/10 text-amber-200" : bet.status === "CASHED_OUT" ? "bg-emerald-300/10 text-emerald-200" : "bg-slate-500/10 text-slate-400"}`}>{bet.status.replaceAll("_", " ")}</span></td><td className="px-4 py-3 text-right tabular-nums text-slate-300">{money(bet.payout)}</td><td className="pl-4 py-3 text-right text-xs tabular-nums text-slate-500">{new Date(bet.placedAt).toLocaleTimeString()}</td></tr>)}</tbody></table>{data.recentBets.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Waiting for the first bet.</p>}</div>
        </section>
      </>}
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/10 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-3 text-2xl font-black tracking-tight text-white">{value}</p><p className="mt-1 text-[11px] text-slate-600">{note}</p></div>;
}
