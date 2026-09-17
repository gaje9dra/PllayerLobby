"use client";

import { useEffect, useMemo, useState } from "react";
import { verifyAviatorFairnessInBrowser } from "@/lib/games/aviator/browser-verifier";

type Round = { id: string; crashMultiplier: string | number | null };
type Commitment = { roundId: string; serverSeedHash: string; clientSeed: string; nonce: string; algorithmVersion: string };
type Reveal = Commitment & { serverSeed: string; crashMultiplier: number };
type Verification = { valid: boolean; hashValid: boolean; calculationValid: boolean; computedHash: string; hmacDigest: string; calculatedCrashMultiplier: number };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }); }} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white">{copied ? "COPIED" : "COPY"}</button>;
}

export function AviatorProvablyFairPanel() {
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      fetch("/api/games/aviator/fairness/current", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/api/games/aviator/history", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),
    ]).then(([nextCommitment, nextRounds]) => {
      if (!mounted) return;
      setCommitment(nextCommitment as Commitment | null);
      const completed = (nextRounds ?? []) as Round[];
      setRounds(completed);
      setSelectedRoundId((current) => current || completed[0]?.id || "");
    }).catch(() => { if (mounted) setError("Unable to load fairness data."); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const selectedRound = useMemo(() => rounds.find((round) => round.id === selectedRoundId) ?? null, [rounds, selectedRoundId]);

  const verifySelectedRound = async () => {
    if (!selectedRoundId) return;
    setVerifying(true); setError(null); setVerification(null); setReveal(null);
    try {
      const response = await fetch(`/api/games/aviator/fairness/${encodeURIComponent(selectedRoundId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === "ROUND_NOT_COMPLETE" ? "Round is not complete yet." : data.error === "FAIRNESS_DATA_NOT_FOUND" ? "Provably fair verification is unavailable for this round." : "Unable to load the round reveal.");
      const result = await verifyAviatorFairnessInBrowser({
        roundId: data.roundId,
        serverSeed: data.serverSeed,
        serverSeedHash: data.serverSeedHash,
        clientSeed: data.clientSeed,
        nonce: data.nonce,
        algorithmVersion: data.algorithmVersion,
        crashMultiplier: Number(data.crashMultiplier),
      });
      setReveal(data as Reveal);
      setVerification(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed.");
    } finally { setVerifying(false); }
  };

  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Transparency</p><h2 className="mt-2 text-xl font-bold text-white">Provably Fair</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">The server commits to a secret seed by publishing its SHA-256 hash before the round. After settlement, the seed is revealed and the browser independently reproduces the HMAC-SHA256 crash calculation.</p></div></div>
      {loading ? <p className="mt-6 text-sm text-slate-500">Loading fairness data…</p> : <>
        {commitment ? <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 sm:col-span-2"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Server Seed Hash</span><CopyButton value={commitment.serverSeedHash} /></div><p className="mt-2 break-all font-mono text-xs text-slate-300">{commitment.serverSeedHash}</p></div><div className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Client Seed</span><p className="mt-2 break-all font-mono text-xs text-slate-300">{commitment.clientSeed}</p></div><div className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Nonce / Algorithm</span><p className="mt-2 font-mono text-xs text-slate-300">{commitment.nonce} / {commitment.algorithmVersion}</p></div><div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 sm:col-span-2"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Server Seed</span><p className="mt-2 text-xs text-slate-500">Hidden until the round is completed and settled.</p></div></div> : <p className="mt-6 text-sm text-slate-500">Current-round fairness commitment is unavailable.</p>}

        <div className="mt-6 border-t border-white/5 pt-6"><div className="flex flex-wrap items-end gap-3"><label className="min-w-[240px] flex-1"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Completed round</span><select value={selectedRoundId} onChange={(event) => { setSelectedRoundId(event.target.value); setReveal(null); setVerification(null); setError(null); }} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-mono text-white outline-none"><option value="">Select a completed round</option>{rounds.map((round) => <option key={round.id} value={round.id}>{round.id} — {Number(round.crashMultiplier ?? 0).toFixed(2)}x</option>)}</select></label><button type="button" disabled={!selectedRoundId || verifying} onClick={() => void verifySelectedRound()} className="rounded-xl bg-lime-300 px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{verifying ? "VERIFYING…" : "VERIFY"}</button></div>{selectedRound && !reveal ? <p className="mt-3 text-xs text-slate-500">Selected result: {Number(selectedRound.crashMultiplier ?? 0).toFixed(2)}x. Click VERIFY to load the post-round seed and independently reproduce it in this browser.</p> : null}</div>

        {reveal && verification ? <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-white">Round verification</h3><span className={`rounded-full px-3 py-1 text-xs font-black ${verification.valid ? "bg-lime-300 text-slate-950" : "bg-red-400/10 text-red-200"}`}>{verification.valid ? "✓ RESULT VERIFIED" : "✕ VERIFICATION FAILED"}</span></div><div className="mt-4 space-y-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500">Round ID</p><p className="mt-1 break-all font-mono text-xs text-slate-300">{reveal.roundId}</p></div></div><div><div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Server Seed</p><CopyButton value={reveal.serverSeed} /></div><p className="mt-1 break-all font-mono text-xs text-slate-300">{reveal.serverSeed}</p></div><div><div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Server Seed Hash</p><CopyButton value={reveal.serverSeedHash} /></div><p className="mt-1 break-all font-mono text-xs text-slate-300">{reveal.serverSeedHash}</p></div><div><div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Client Seed</p><CopyButton value={reveal.clientSeed} /></div><p className="mt-1 break-all font-mono text-xs text-slate-300">{reveal.clientSeed}</p></div><p className="text-xs text-slate-400">Nonce: <span className="font-mono text-slate-300">{reveal.nonce}</span> · Algorithm: <span className="font-mono text-slate-300">{reveal.algorithmVersion}</span> · Crash: <span className="font-mono font-bold text-white">{reveal.crashMultiplier.toFixed(2)}x</span></p><div className="grid gap-2 sm:grid-cols-2"><p className={`rounded-lg border p-3 text-xs ${verification.hashValid ? "border-lime-300/20 text-lime-200" : "border-red-400/20 text-red-200"}`}>{verification.hashValid ? "✓ SHA-256 commitment matches the revealed seed." : "✕ SHA-256 commitment does not match the revealed seed."}</p><p className={`rounded-lg border p-3 text-xs ${verification.calculationValid ? "border-lime-300/20 text-lime-200" : "border-red-400/20 text-red-200"}`}>{verification.calculationValid ? `✓ HMAC calculation reproduces ${verification.calculatedCrashMultiplier.toFixed(2)}x.` : `✕ HMAC calculation produced ${verification.calculatedCrashMultiplier.toFixed(2)}x instead.`}</p></div></div></div> : null}
        {error ? <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}
        <div className="mt-6 border-t border-white/5 pt-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">How it works</p><ol className="mt-3 grid gap-2 text-xs leading-5 text-slate-400 sm:grid-cols-2"><li>1. A cryptographically random server seed is created.</li><li>2. Its SHA-256 hash is published before the round.</li><li>3. The documented HMAC-SHA256 algorithm derives the crash point.</li><li>4. After settlement, the encrypted server seed is revealed through the verification API.</li><li>5. Hashing the revealed seed checks the original commitment.</li><li>6. The browser independently recalculates the crash point from the revealed inputs.</li></ol></div>
      </>}
    </section>
  );
}
