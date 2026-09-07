"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function JoinRoom({ tournamentId, registrationId }: { tournamentId: string; registrationId: string }) {
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<{ roomId: string; roomPassword: string } | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setRoom(null);
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ registrationId, registrationCode: code }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setMessage(data?.message || "Unable to access tournament joining details.");
        return;
      }
      setRoom({ roomId: data.roomId, roomPassword: data.roomPassword });
    } catch {
      setMessage("Unable to access tournament joining details. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <div className="mt-7 space-y-5">
      {!room ? (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="registration-code" className="text-sm font-semibold text-slate-200">Registration Code</label>
            <input id="registration-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" spellCheck={false} maxLength={16} required placeholder="XXXX-XXXX-XXXX" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 font-mono text-sm tracking-wider text-white outline-none focus:border-lime-300/40" />
          </div>
          <Button type="submit" disabled={loading}>{loading ? "Verifying..." : "Access Room Details"}</Button>
          {message ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">{message}</p> : null}
        </form>
      ) : (
        <div className="space-y-4" role="status">
          <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-5">
            <p className="text-sm font-bold text-lime-200">Room details available</p>
            <p className="mt-1 text-xs text-lime-100/70">These credentials were released only after server-side authorization.</p>
          </div>
          <Credential label="Room ID" value={room.roomId} onCopy={copy} />
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Room Password</p><p className="mt-2 truncate font-mono text-sm font-bold text-white">{showPassword ? room.roomPassword : "••••••••••••"}</p></div>
              <div className="flex shrink-0 gap-2"><button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">{showPassword ? "Hide" : "Show"}</button><button type="button" onClick={() => copy(room.roomPassword)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">Copy</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Credential({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string) => Promise<void> }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-2 break-all font-mono text-sm font-bold text-white">{value}</p></div><button type="button" onClick={() => onCopy(value)} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">Copy</button></div></div>;
}
