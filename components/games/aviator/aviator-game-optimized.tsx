"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AviatorRoundSnapshot } from "@/lib/games/aviator/types";
import { multiplyMoneyByMultiplier } from "@/lib/wallet-rules";
import { AviatorProvablyFairPanel } from "./provably-fair-panel";

type Bet = { id: string; roundId: string; stake: string; status: string; cashoutMultiplier: string | null; autoCashoutMultiplier: string | null; payout: string; createdAt: string };
type RoundHistoryItem = { id: string; crashMultiplier: string | number | null };
type ServerEvent = { type: string; snapshot?: AviatorRoundSnapshot; roundId?: string };

const initialSnapshot: AviatorRoundSnapshot = {
  roundId: "loading",
  phase: "WAITING",
  serverTime: 0,
  multiplier: 1,
  startedAt: null,
  waitingEndsAt: null,
  fairness: { roundId: "loading", serverSeedHash: "", clientSeed: "", nonce: "0", algorithmVersion: "v1" },
};

function formatResult(status: string) {
  return status === "CASHED_OUT" ? "WON" : status;
}

function centsFromInput(value: string) {
  const normalized = value.trim().replace(/^₹/, "");
  if (!/^\d*(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = (Number.parseInt(whole || "0", 10) * 100) + Number.parseInt((fraction + "00").slice(0, 2), 10);
  return Number.isSafeInteger(cents) ? cents : null;
}

function amountFromCents(cents: number) {
  return `${Math.max(0, cents) / 100}`;
}

function historyTone(value: number) {
  if (value >= 10) return "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200";
  if (value >= 2) return "border-lime-300/30 bg-lime-300/10 text-lime-200";
  return "border-white/10 bg-white/[0.03] text-slate-300";
}

function graphGeometry(multiplier: number, phase: AviatorRoundSnapshot["phase"]) {
  const safe = Math.max(1, multiplier);
  const progress = phase === "WAITING" ? 0.08 : Math.min(1, Math.log(safe) / Math.log(25));
  const endX = 70 + progress * 510;
  const endY = 300 - progress * 215;
  const controlX = 220 + progress * 170;
  const controlY = 305 - progress * 100;
  return { progress, endX, endY, path: `M 25 320 C 120 320, ${controlX.toFixed(1)} ${controlY.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}` };
}

export function AviatorGameOptimized() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [bets, setBets] = useState<Bet[]>([]);
  const [history, setHistory] = useState<Bet[]>([]);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryItem[]>([]);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [connection, setConnection] = useState("Connecting");
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [amount, setAmount] = useState("100.00");
  const [autoMultiplier, setAutoMultiplier] = useState("2.00");
  const [busy, setBusy] = useState(false);
  const [cashoutBusy, setCashoutBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef(initialSnapshot);
  const betsRef = useRef<Bet[]>([]);
  const cashoutBusyRef = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);

  const loadBets = useCallback(async (roundId?: string) => {
    try {
      const query = roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
      const response = await fetch(`/api/games/aviator/bets${query}`, { cache: "no-store" });
      if (response.status === 401) {
        setAuthenticated(false); setWalletBalance(null); betsRef.current = []; setBets([]); return;
      }
      if (!response.ok) return;
      const data = await response.json();
      setAuthenticated(true);
      setWalletBalance(String(data.walletBalance ?? "0.00"));
      const next = (data.bets ?? []) as Bet[];
      betsRef.current = next;
      setBets(next);
    } catch { /* Preserve last known private state during transient failures. */ }
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

  const cashOut = useCallback(async (bet: Bet) => {
    if (cashoutBusyRef.current || snapshotRef.current.phase !== "RUNNING") return;
    cashoutBusyRef.current = bet.id;
    setCashoutBusy(bet.id);
    setError(null);
    try {
      const response = await fetch(`/api/games/aviator/bets/${bet.id}/cashout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: snapshotRef.current.roundId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Cashout failed.");
      await loadBets(snapshotRef.current.roundId);
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cashout failed.");
    } finally {
      cashoutBusyRef.current = null;
      setCashoutBusy(null);
    }
  }, [loadBets, loadHistory]);

  useEffect(() => {
    let mounted = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let lastRoundId = "loading";
    let lastPhase = "WAITING";

    const applySnapshot = (next: AviatorRoundSnapshot) => {
      const roundChanged = next.roundId !== lastRoundId;
      const phaseChanged = next.phase !== lastPhase;
      lastRoundId = next.roundId;
      lastPhase = next.phase;
      snapshotRef.current = next;
      setSnapshot(next);
      if (roundChanged || phaseChanged) {
        void loadBets(next.roundId);
        if (roundChanged || next.phase === "CRASHED") void loadHistory();
      }
    };

    const loadRound = async () => {
      try {
        const response = await fetch("/api/games/aviator/round", { cache: "no-store" });
        if (!response.ok) throw new Error("round request failed");
        applySnapshot((await response.json()) as AviatorRoundSnapshot);
      } catch {
        if (mounted) setConnection("Disconnected");
      }
    };

    const connect = () => {
      if (!mounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/games/aviator/ws`);
      socket.onopen = () => {
        if (!mounted || !socket) return;
        setConnection("Connected");
        socket.send(JSON.stringify({ type: "round:sync", roundId: snapshotRef.current.roundId === "loading" ? undefined : snapshotRef.current.roundId }));
      };
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as ServerEvent;
          if (event.snapshot) applySnapshot(event.snapshot);
          if (["bet:cashout", "bet:lost", "bet:settled"].includes(event.type)) {
            void loadBets(event.roundId); void loadHistory();
          }
          if (["round:crashed", "round:settled"].includes(event.type)) {
            void loadBets(); void loadHistory();
          }
        } catch {
          if (mounted) setConnection("Disconnected");
        }
      };
      socket.onerror = () => { if (mounted) setConnection("Disconnected"); };
      socket.onclose = () => {
        if (mounted) {
          setConnection("Reconnecting");
          reconnectTimer = window.setTimeout(connect, 1000);
        }
      };
    };

    void loadRound();
    void loadHistory();
    void loadBets();
    connect();
    const pollTimer = window.setInterval(() => {
      if (!document.hidden && (!socket || socket.readyState !== WebSocket.OPEN)) void loadRound();
    }, 1000);
    return () => {
      mounted = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.clearInterval(pollTimer);
      socket?.close();
    };
  }, [loadBets, loadHistory]);

  useEffect(() => {
    let frame = 0;
    let lastAutoCheck = 0;
    const tick = (time: number) => {
      const current = snapshotRef.current;
      if (time - lastAutoCheck >= 100) {
        lastAutoCheck = time;
        const autoBet = betsRef.current.find((bet) => bet.status === "ACTIVE" && bet.roundId === current.roundId && bet.autoCashoutMultiplier && current.multiplier >= Number(bet.autoCashoutMultiplier));
        if (current.phase === "RUNNING" && autoBet && !cashoutBusyRef.current) void cashOut(autoBet);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [cashOut]);

  const activeBets = bets.filter((bet) => bet.status === "ACTIVE" && bet.roundId === snapshot.roundId);
  const canBet = authenticated === true && snapshot.phase === "WAITING" && !busy;
  const amountCents = centsFromInput(amount);
  const autoCents = centsFromInput(autoMultiplier);
  const canConfigureAuto = mode === "auto" && autoCents !== null && autoCents >= 100;
  const potentialPayout = useMemo(() => {
    if (amountCents === null || amountCents <= 0) return null;
    try { return multiplyMoneyByMultiplier(amount, mode === "auto" ? autoMultiplier : "1.00"); } catch { return null; }
  }, [amount, amountCents, autoMultiplier, mode]);
  const geometry = graphGeometry(snapshot.multiplier, snapshot.phase);
  const planeX = geometry.endX;
  const planeY = geometry.endY;

  const adjustAmount = (factor: "half" | "double") => {
    if (amountCents === null) return;
    const next = factor === "half" ? Math.floor(amountCents / 2) : amountCents * 2;
    setAmount(amountFromCents(Math.min(next, Number.MAX_SAFE_INTEGER)));
  };

  const adjustBy = (deltaCents: number) => {
    if (amountCents === null) return;
    setAmount(amountFromCents(Math.max(0, amountCents + deltaCents)));
  };

  const placeBet = async () => {
    if (!canBet || amountCents === null || amountCents <= 0 || (mode === "auto" && !canConfigureAuto)) {
      if (mode === "auto" && !canConfigureAuto) setError("Enter a valid automatic cashout of at least 1.00x.");
      return;
    }
    setBusy(true); setError(null);
    const clientRequestId = requestId.current ?? crypto.randomUUID();
    requestId.current = clientRequestId;
    try {
      const response = await fetch("/api/games/aviator/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": clientRequestId },
        body: JSON.stringify({ roundId: snapshot.roundId, amount, clientRequestId, autoCashoutMultiplier: mode === "auto" ? autoMultiplier : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Unable to place bet.");
      requestId.current = null;
      setWalletBalance(String(data.walletBalance ?? walletBalance ?? "0.00"));
      await loadBets(snapshot.roundId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to place bet.");
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = snapshot.phase === "WAITING" ? "WAITING" : snapshot.phase === "RUNNING" ? "LIVE" : snapshot.phase === "CRASHED" ? "CRASHED" : "SETTLED";
  const statusCopy = snapshot.phase === "WAITING" ? "Betting open — next round starting soon" : snapshot.phase === "RUNNING" ? "Round running" : snapshot.phase === "CRASHED" ? "Round crashed" : "Round settled";

  return (
    <main className="min-h-screen bg-[#07111f] px-3 py-5 text-white sm:px-5 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white/5 text-lg">✈</span><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">PlayerLobby Games</p><h1 className="text-xl font-black tracking-tight sm:text-2xl">Aviator</h1></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/wallet" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.08]">Wallet {walletBalance !== null ? `₹${walletBalance}` : ""}</Link>
            <span className={`rounded-xl border px-3 py-2 text-xs font-bold ${connection === "Connected" ? "border-lime-300/20 bg-lime-300/5 text-lime-200" : connection === "Reconnecting" ? "border-amber-300/20 bg-amber-300/5 text-amber-200" : "border-red-300/20 bg-red-300/5 text-red-200"}`}><span aria-hidden="true">●</span> {connection}</span>
          </div>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0a1728] shadow-2xl">
          <div className="border-b border-white/5 bg-[#0c1b2f] px-3 py-3 sm:px-5">
            <div className="flex items-center gap-2 overflow-x-auto" aria-label="Recent multipliers">
              {roundHistory.length ? roundHistory.slice(0, 16).map((round) => {
                const value = Number(round.crashMultiplier ?? 0);
                return <a key={round.id} href="#fairness" title="Open fairness verification" className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-black transition hover:brightness-125 ${historyTone(value)}`}>{value.toFixed(2)}x</a>;
              }) : <span className="px-2 text-xs text-slate-500">No completed rounds yet</span>}
            </div>
          </div>

          <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="order-2 border-t border-white/5 bg-[#091526] p-4 lg:order-1 lg:border-r lg:border-t-0 lg:p-5">
              <div className="flex rounded-xl bg-[#111f32] p-1" role="tablist" aria-label="Bet mode">
                <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-black transition ${mode === "manual" ? "bg-[#203149] text-white shadow" : "text-slate-500 hover:text-slate-300"}`}>Manual</button>
                <button type="button" role="tab" aria-selected={mode === "auto"} onClick={() => setMode("auto")} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-black transition ${mode === "auto" ? "bg-[#203149] text-white shadow" : "text-slate-500 hover:text-slate-300"}`}>Auto</button>
              </div>

              {authenticated === false ? <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4"><p className="text-sm leading-6 text-slate-400">Sign in to use your wallet and place bets.</p><Link href="/login" className="mt-4 inline-flex w-full justify-center rounded-xl bg-sky-500 px-4 py-3 text-sm font-black text-white">Continue with Google</Link></div> : <>
                <label htmlFor="aviator-amount" className="mt-5 block text-xs font-bold uppercase tracking-wider text-slate-500">Bet Amount</label>
                <div className="mt-2 flex h-12 items-center rounded-xl border border-white/10 bg-[#101f33] px-3 focus-within:border-sky-400/50">
                  <span className="text-slate-500">₹</span><input id="aviator-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-describedby="amount-help" className="min-w-0 flex-1 bg-transparent px-2 text-right font-black text-white outline-none" />
                </div>
                <p id="amount-help" className="mt-1 text-[11px] text-slate-600">Use up to 2 decimal places.</p>
                <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => adjustAmount("half")} className="rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs font-black text-slate-300 hover:bg-white/[0.07]">½</button><button type="button" onClick={() => adjustAmount("double")} className="rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs font-black text-slate-300 hover:bg-white/[0.07]">2×</button></div>
                <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => adjustBy(-100)} className="rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs font-bold text-slate-400">− ₹1</button><button type="button" onClick={() => adjustBy(100)} className="rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs font-bold text-slate-400">+ ₹1</button></div>

                {mode === "auto" ? <div className="mt-5"><label htmlFor="aviator-auto" className="block text-xs font-bold uppercase tracking-wider text-slate-500">Cashout At</label><div className="mt-2 flex h-12 items-center rounded-xl border border-white/10 bg-[#101f33] px-3"><input id="aviator-auto" value={autoMultiplier} onChange={(event) => setAutoMultiplier(event.target.value)} inputMode="decimal" aria-label="Automatic cashout multiplier" className="min-w-0 flex-1 bg-transparent text-center font-black text-white outline-none" /><span className="text-slate-500">×</span></div><div className="mt-2 flex gap-2"><button type="button" onClick={() => setAutoMultiplier((value) => { const cents = centsFromInput(value); return cents === null ? "1.00" : amountFromCents(Math.max(100, cents - 50)); })} className="flex-1 rounded-lg border border-white/10 py-2 text-xs text-slate-400">− 0.50×</button><button type="button" onClick={() => setAutoMultiplier((value) => { const cents = centsFromInput(value); return cents === null ? "2.00" : amountFromCents(cents + 50); })} className="flex-1 rounded-lg border border-white/10 py-2 text-xs text-slate-400">+ 0.50×</button></div></div> : null}

                {error ? <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs leading-5 text-red-200">{error}</p> : null}
                <button type="button" disabled={!canBet || amountCents === null || amountCents <= 0} onClick={() => void placeBet()} className="mt-5 w-full rounded-xl bg-sky-500 px-4 py-3.5 text-sm font-black shadow-lg shadow-sky-500/10 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-35">{busy ? "PLACING…" : snapshot.phase === "WAITING" ? "BET NEXT ROUND" : "BETTING CLOSED"}</button>
                <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4"><span className="text-xs text-slate-500">Profit on win</span><span className="font-black text-slate-200">₹{potentialPayout ?? "0.00"}</span></div>
              </>}

              {activeBets.length ? <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-wider text-slate-500">Active bets</h2><span className="text-[10px] text-slate-600">{activeBets.length}</span></div>{activeBets.map((bet) => { let payout = bet.stake; try { payout = multiplyMoneyByMultiplier(bet.stake, snapshot.multiplier.toFixed(2)); } catch { /* Keep stake if shared formatter rejects transient data. */ } return <div key={bet.id} className="rounded-2xl border border-white/10 bg-[#101f33] p-3"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">Stake</span><span className="font-black">₹{bet.stake}</span></div><div className="mt-2 flex items-center justify-between"><span className="text-xs text-slate-500">Current payout</span><span className="font-black text-lime-200">₹{payout}</span></div>{bet.autoCashoutMultiplier ? <p className="mt-2 text-[11px] text-slate-500">Auto cashout {bet.autoCashoutMultiplier}x</p> : null}<button type="button" disabled={snapshot.phase !== "RUNNING" || cashoutBusy === bet.id} onClick={() => void cashOut(bet)} className="mt-3 w-full rounded-lg border border-lime-300/20 bg-lime-300/5 py-2.5 text-xs font-black text-lime-200 disabled:opacity-35">{cashoutBusy === bet.id ? "CASHING OUT…" : `CASH OUT ${bet.autoCashoutMultiplier ? "MANUALLY" : ""}`}</button></div>; })}</div> : null}
            </aside>

            <section className="order-1 min-w-0 lg:order-2">
              <div className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(23,71,118,0.35),transparent_58%),linear-gradient(180deg,#0b2036_0%,#081522_100%)] sm:min-h-[540px]">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(111,160,202,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(111,160,202,.08)_1px,transparent_1px)] [background-size:56px_56px]" aria-hidden="true" />
                <div className="absolute left-4 top-4 z-10 flex items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${snapshot.phase === "CRASHED" ? "border-red-300/30 bg-red-400/10 text-red-200" : "border-white/10 bg-black/20 text-slate-300"}`}>{statusLabel}</span><span className="text-[10px] text-slate-500">{statusCopy}</span></div>
                <div className="absolute right-4 top-4 z-10 flex gap-2"><a href="#fairness" className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white">Fairness</a><a href="#history" className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white">History</a></div>

                <svg viewBox="0 0 620 360" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
                  <defs><linearGradient id="aviatorFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopOpacity=".32" /><stop offset="1" stopOpacity="0" /></linearGradient></defs>
                  <path d={`${geometry.path} L ${geometry.endX.toFixed(1)} 320 L 25 320 Z`} fill="url(#aviatorFill)" />
                  <path d={geometry.path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className={snapshot.phase === "CRASHED" ? "text-red-300" : "text-sky-300"} />
                  <g transform={`translate(${planeX - 16},${planeY - 16}) rotate(-18 16 16)`} className={snapshot.phase === "CRASHED" ? "text-red-300" : "text-white"}>
                    <path d="M2 18 30 14 20 9 13 2 10 3 13 11 2 15Z" fill="currentColor" />
                  </g>
                  {snapshot.phase === "CRASHED" ? <g><circle cx={planeX} cy={planeY} r="20" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-300/60" /><path d={`M ${planeX - 12} ${planeY - 12} L ${planeX + 12} ${planeY + 12} M ${planeX + 12} ${planeY - 12} L ${planeX - 12} ${planeY + 12}`} stroke="currentColor" strokeWidth="3" className="text-red-300" /></g> : null}
                </svg>

                <div className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center"><p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">{snapshot.phase === "CRASHED" ? "CRASHED" : snapshot.phase === "SETTLED" ? "SETTLED" : snapshot.phase === "WAITING" ? "NEXT ROUND" : "CURRENT MULTIPLIER"}</p><div className={`mt-2 text-6xl font-black tracking-tight tabular-nums sm:text-8xl ${snapshot.phase === "CRASHED" ? "text-red-300" : "text-white"}`}>{snapshot.multiplier.toFixed(2)}x</div>{snapshot.phase === "WAITING" && snapshot.waitingEndsAt ? <p className="mt-2 text-sm font-bold text-slate-400">Starting in {Math.max(0, (snapshot.waitingEndsAt - Date.now()) / 1000).toFixed(1)}s</p> : null}<p className="mt-3 text-[10px] font-mono text-slate-600">Round {snapshot.roundId}</p></div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-white/5 border-t border-white/5 bg-[#0b192b] sm:grid-cols-3 sm:divide-x"><div className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Wallet</p><p className="mt-1 font-black text-slate-200">{walletBalance !== null ? `₹${walletBalance}` : "—"}</p></div><div className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Players</p><p className="mt-1 font-black text-slate-300">—</p><p className="text-[10px] text-slate-600">Not exposed by backend</p></div><div className="col-span-2 p-4 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Controls</p><div className="mt-1 flex flex-wrap gap-3 text-xs font-bold"><a href="#fairness" className="text-sky-300 hover:text-sky-200">Provably Fair</a><a href="#history" className="text-sky-300 hover:text-sky-200">History</a><Link href="/dashboard/wallet" className="text-sky-300 hover:text-sky-200">Wallet</Link></div></div></div>
            </section>
          </div>
        </section>

        <section id="history" className="mt-4 rounded-[24px] border border-white/10 bg-[#0a1728] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-600">Activity</p><h2 className="mt-1 text-lg font-black">Your bet history</h2></div><span className="text-xs text-slate-600">Recent activity</span></div><div className="mt-4 overflow-x-auto">{history.length ? <table className="w-full min-w-[650px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-slate-600"><tr><th className="pb-3">Round</th><th>Stake</th><th>Cashout</th><th>Payout</th><th>Result</th><th>Date</th></tr></thead><tbody>{history.map((bet) => <tr key={bet.id} className="border-t border-white/5 text-slate-300"><td className="py-3 font-mono">{bet.roundId.slice(0, 10)}</td><td>₹{bet.stake}</td><td>{bet.cashoutMultiplier ? `${bet.cashoutMultiplier}x` : "—"}</td><td>₹{bet.payout}</td><td className={bet.status === "CASHED_OUT" ? "font-bold text-lime-200" : bet.status === "LOST" ? "font-bold text-red-300" : "text-slate-400"}>{formatResult(bet.status)}</td><td>{new Date(bet.createdAt).toLocaleString()}</td></tr>)}</tbody></table> : <p className="py-6 text-sm text-slate-600">No bets yet.</p>}</div></section>

        <section className="mt-4 rounded-[24px] border border-white/10 bg-[#0a1728] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-600">Completed rounds</p><h2 className="mt-1 text-lg font-black">Round history</h2></div><span className="text-xs text-slate-600">Historical results only</span></div><div className="mt-4 flex gap-2 overflow-x-auto pb-1">{roundHistory.length ? roundHistory.slice(0, 30).map((round) => { const value = Number(round.crashMultiplier ?? 0); return <a key={round.id} href="#fairness" className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-black ${historyTone(value)}`}>{value.toFixed(2)}x</a>; }) : <span className="text-sm text-slate-600">No completed rounds yet.</span>}</div></section>

        <div id="fairness" className="mt-4"><AviatorProvablyFairPanel /></div>
      </div>
    </main>
  );
}
