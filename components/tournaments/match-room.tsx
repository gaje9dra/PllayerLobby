"use client";

import { useState } from "react";

export function MatchRoom({ matchId }: { matchId: string }) {
  const [room, setRoom] = useState<{ roomId: string; roomPassword: string } | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/room`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.message || "Room credentials are not available.");
      setRoom({ roomId: data.roomId, roomPassword: data.roomPassword });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to access match room credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <div className="mt-7 space-y-4">
      {!room ? <>
        <p className="text-sm leading-6 text-slate-400">Room credentials are protected and are released only after the server confirms that your account is an eligible participant in this match.</p>
        <button type="button" onClick={load} disabled={loading} className="min-h-11 rounded-xl bg-lime-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">{loading ? "Checking..." : "Access Room Details"}</button>
        {message ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">{message}</p> : null}
      </> : <div className="space-y-4" role="status">
        <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-5"><p className="text-sm font-bold text-lime-200">Your match room</p><p className="mt-1 text-xs text-lime-100/70">Credentials were returned only after server-side participant authorization.</p></div>
        <Credential label="Room ID" value={room.roomId} onCopy={copy} />
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Room Password</p><p className="mt-2 truncate font-mono text-sm font-bold text-white">{showPassword ? room.roomPassword : "••••••••••••"}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">{showPassword ? "Hide" : "Show"}</button><button type="button" onClick={() => copy(room.roomPassword)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">Copy</button></div></div></div>
      </div>}
    </div>
  );
}

function Credential({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string) => Promise<void> }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-2 break-all font-mono text-sm font-bold text-white">{value}</p></div><button type="button" onClick={() => onCopy(value)} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">Copy</button></div></div>;
}
