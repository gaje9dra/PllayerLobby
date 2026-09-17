"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AviatorRoundSnapshot } from "@/lib/games/aviator/types";
import { multiplyMoneyByMultiplier } from "@/lib/wallet-rules";

type Bet = { id: string; roundId: string; stake: string; status: string; cashoutMultiplier: string | null; autoCashoutMultiplier: string | null; payout: string; createdAt: string };
type RoundHistoryItem = { id: string; crashMultiplier: string | number | null };
type ServerEvent = { type: string; snapshot?: AviatorRoundSnapshot; roundId?: string };

const initialSnapshot: AviatorRoundSnapshot = { roundId: "loading", phase: "WAITING", serverTime: 0, multiplier: 1, startedAt: null, waitingEndsAt: null };

function formatResult(status: string) { return status === "CASHED_OUT" ? "WON" : status; }

export function AviatorGame() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [bets, setBets] = useState<Bet[]>([]);
  const [history, setHistory] = useState<Bet[]>([]);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryItem[]>([]);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [connection, setConnection] = useState("Connecting...");
  const [clientNow, setClientNow] = useState(() => Date.now());
  const [amount, setAmount] = useState("100.00");
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoMultiplier, setAutoMultiplier] = useState("2.00");
  const [busy, setBusy] = useState(false);
  const [cashoutBusy, setCashoutBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  const loadBets = useCallback(async (roundId?: string) => {
    try {
      const query = roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
      const response = await fetch(`/api/games/aviator/bets${query}`, { cache: "no-store" });
      if (response.status === 401) { setAuthenticated(false); setWalletBalance(null); setBets([]); return; }
      if (!response.ok) return;
      const data = await response.json();
      setAuthenticated(true);
      setWalletBalance(String(data.walletBalance ?? "0.00"));
      setBets((data.bets ?? []) as Bet[]);
    } catch { /* Live round remains usable when private state is temporarily unavailable. */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const [betsResponse, roundsResponse] = await Promise.all([
        fetch("/api/games/aviator/bets/history?page=1", { cache: "no-store" }),
        fetch("/api/games/aviator/history", { cache: "no-store" }),
      ]);
      if (betsResponse.ok) setHistory(((await betsResponse.json()).items ?? []) as Bet[]);
      if (roundsResponse.ok) setRoundHistory((await roundsResponse.json()) as RoundHistoryItem[]);
    } catch { /* History is supplementary. */ }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClientNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const loadRound = async () => {
      try {
        const response = await fetch("/api/games/aviator/round", { cache: "no-store" });
        if (!response.ok) throw new Error("round request failed");
        const next = (await response.json()) as AviatorRoundSnapshot;
        if (mounted) setSnapshot(next);
        void loadBets(next.roundId);
      } catch { if (mounted) setConnection("Disconnected"); }
    };

    const connect = () => {
      if (!mounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/games/aviator/ws`);
      socket.onopen = () => { if (mounted && socket) { setConnection("Connected"); socket.send(JSON.stringify({ type: "round:sync" })); } };
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as ServerEvent;
          if (event.snapshot) { setSnapshot(event.snapshot); void loadBets(event.snapshot.roundId); }
          if (["bet:cashout", "bet:lost", "bet:settled"].includes(event.type)) { void loadBets(event.roundId); void loadHistory(); }
          if (["round:crashed", "round:settled"].includes(event.type)) { void loadBets(); void loadHistory(); }
        } catch { if (mounted) setConnection("Disconnected"); }
      };
      socket.onerror = () => { if (mounted) setConnection("Disconnected"); };
      socket.onclose = () => { if (mounted) reconnectTimer = window.setTimeout(connect, 1000); };
    };

    void loadRound();
    void loadBets();
    void loadHistory();
    connect();
    return () => { mounted = false; if (reconnectTimer !== null) window.clearTimeout(reconnectTimer); socket?.close(); };
  }, [loadBets, loadHistory]);

  const statusText = useMemo(() => ({ WAITING: "Betting open — next round starting soon", RUNNING: "Round running", CRASHED: "Crashed", SETTLED: "Round settled" })[snapshot.phase], [snapshot.phase]);
  const countdown = snapshot.phase === "WAITING" && snapshot.waitingEndsAt ? Math.max(0, (snapshot.waitingEndsAt - clientNow) / 1000).toFixed(1) : null;
  const activeBets = bets.filter((bet) => bet.status === "ACTIVE" && bet.roundId === snapshot.roundId);
  const canBet = authenticated === true && snapshot.phase === "WAITING" && !busy;

  const placeBet = async () => {
    if (!canBet) return;
    setBusy(true); setError(null);
    const clientRequestId = requestId.current ?? crypto.randomUUID();
    requestId.current = clientRequestId;
    try {
      const response = await fetch("/api/games/aviator/bets", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": clientRequestId }, body: JSON.stringify({ roundId: snapshot.roundId, amount, clientRequestId, autoCashoutMultiplier: autoEnabled ? autoMultiplier : null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Unable to place bet.");
      requestId.current = null;
      setWalletBalance(String(data.walletBalance ?? walletBalance ?? "0.00"));
      await loadBets(snapshot.roundId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to place bet."); }
    finally { setBusy(false); }
  };

  const cashOut = async (bet: Bet) => {
    if (cashoutBusy || snapshot.phase !== "RUNNING") return;
    setCashoutBusy(bet.id); setError(null);
    try {
      const response = await fetch(`/api/games/aviator/bets/${bet.id}/cashout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roundId: snapshot.roundId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Cashout failed.");
      await loadBets(snapshot.roundId); await loadHistory();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Cashout failed."); }
    finally { setCashoutBusy(null); }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Games</p><h1 className="mt-2 text-3xl font-black text-white">Aviator</h1></div><div className="flex items-center gap-3">{walletBalance !== null ? <span className="rounded-full border border-lime-300/20 bg-lime-300/5 px-3 py-1 text-xs font-bold text-lime-200">Balance ₹{walletBalance}</span> : null}<span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{connection}</span></div></div>
      <section className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl sm:p-10"><div className={`flex min-h-[360px] flex-col items-center justify-center rounded-2xl border bg-white/[0.025] text-center ${snapshot.phase === "CRASHED" ? "border-red-400/30" : "border-white/5"}`}><p className="text-sm font-semibold text-slate-400">{statusText}</p>{countdown ? <p className="mt-3 text-lg font-bold text-slate-300">Starting in {countdown}s</p> : null}<div className={`my-5 text-7xl font-black tabular-nums sm:text-8xl ${snapshot.phase === "CRASHED" ? "text-red-300" : "text-white"}`}>{snapshot.multiplier.toFixed(2)}x</div><p className="text-xs text-slate-500">Round {snapshot.roundId}</p></div></div>
        <aside className="rounded-3xl border border-white/10 bg-white/[0.035] p-6"><h2 className="text-lg font-bold text-white">Place bet</h2>{authenticated === false ? <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300"><p>Sign in to use the wallet and place bets.</p><Link href="/login" className="mt-4 inline-flex rounded-xl bg-lime-300 px-4 py-2 font-bold text-slate-950">Sign in with Google</Link></div> : <><label className="mt-5 block text-sm font-semibold text-slate-300" htmlFor="aviator-amount">Bet amount</label><div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => setAmount((value) => Math.max(1, Number(value) - 10).toFixed(2))} className="size-11 rounded-xl border border-white/10 text-xl text-white">−</button><div className="flex flex-1 items-center rounded-xl border border-white/10 bg-slate-950 px-3"><span className="text-slate-500">₹</span><input id="aviator-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="w-full bg-transparent px-2 py-3 text-center font-bold text-white outline-none" /></div><button type="button" onClick={() => setAmount((value) => (Number(value) + 10).toFixed(2))} className="size-11 rounded-xl border border-white/10 text-xl text-white">+</button></div><div className="mt-5 flex items-center justify-between"><span className="text-sm font-semibold text-slate-300">Auto Cashout</span><button type="button" onClick={() => setAutoEnabled((value) => !value)} className={`rounded-full px-3 py-1 text-xs font-bold ${autoEnabled ? "bg-lime-300 text-slate-950" : "border border-white/10 text-slate-400"}`}>{autoEnabled ? "ON" : "OFF"}</button></div>{autoEnabled ? <input value={autoMultiplier} onChange={(event) => setAutoMultiplier(event.target.value)} inputMode="decimal" aria-label="Auto cashout multiplier" className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 font-bold text-white outline-none" placeholder="2.00x" /> : null}{error ? <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}<button type="button" disabled={!canBet} onClick={() => void placeBet()} className="mt-5 w-full rounded-xl bg-lime-300 px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "PLACING…" : snapshot.phase === "WAITING" ? "PLACE BET" : "BETTING CLOSED"}</button></>}{activeBets.length ? <div className="mt-6 space-y-3"><h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Active bets</h3>{activeBets.map((bet) => { let potential = bet.stake; try { potential = multiplyMoneyByMultiplier(bet.stake, snapshot.multiplier.toFixed(2)); } catch { /* keep stake */ } return <div key={bet.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">Bet</span><span className="font-black text-white">₹{bet.stake}</span></div><div className="mt-2 flex items-center justify-between text-sm"><span className="text-slate-500">Potential payout</span><span className="font-bold text-lime-200">₹{potential}</span></div>{bet.autoCashoutMultiplier ? <p className="mt-2 text-xs text-slate-500">Auto cashout {bet.autoCashoutMultiplier}x</p> : null}<button type="button" disabled={snapshot.phase !== "RUNNING" || cashoutBusy === bet.id} onClick={() => void cashOut(bet)} className="mt-3 w-full rounded-xl border border-lime-300/30 bg-lime-300/10 px-4 py-3 font-black text-lime-200 disabled:opacity-40">{cashoutBusy === bet.id ? "CASHING OUT…" : "CASH OUT"}</button></div>; })}</div> : null}</aside>
      </section>
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-6"><h2 className="text-lg font-bold text-white">Your bet history</h2><div className="mt-5 overflow-x-auto">{history.length ? <table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Round</th><th>Stake</th><th>Cashout</th><th>Payout</th><th>Result</th><th>Date</th></tr></thead><tbody>{history.map((bet) => <tr key={bet.id} className="border-t border-white/5 text-slate-300"><td className="py-3 font-mono text-xs">{bet.roundId.slice(0, 8)}</td><td>₹{bet.stake}</td><td>{bet.cashoutMultiplier ? `${bet.cashoutMultiplier}x` : "—"}</td><td>₹{bet.payout}</td><td className={bet.status === "CASHED_OUT" ? "text-lime-200" : bet.status === "LOST" ? "text-red-300" : "text-slate-300"}>{formatResult(bet.status)}</td><td>{new Date(bet.createdAt).toLocaleString()}</td></tr>)}</tbody></table> : <p className="text-sm text-slate-500">No bets yet.</p>}</div></section>
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-6"><h2 className="text-lg font-bold text-white">Recent rounds</h2><p className="mt-2 text-sm text-slate-500">Historical results only; previous rounds do not predict future outcomes.</p><div className="mt-5 flex flex-wrap gap-3">{roundHistory.length ? roundHistory.map((round) => <span key={round.id} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300">{Number(round.crashMultiplier ?? 1).toFixed(2)}x</span>) : <span className="text-sm text-slate-500">No completed rounds yet.</span>}</div></section>
    </main>
  );
}
