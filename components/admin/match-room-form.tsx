"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type RoomState = { configured: boolean; published: boolean; revoked: boolean; roomId?: string; roomPassword?: string };

export function MatchRoomForm({ matchId }: { matchId: string }) {
  const [state, setState] = useState<RoomState | null>(null);
  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [published, setPublished] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load(reveal = false) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/matches/${encodeURIComponent(matchId)}/room${reveal ? "?reveal=1" : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.message || "Unable to load room credentials.");
      setState(data.data);
      setPublished(Boolean(data.data?.published));
      if (reveal && data.data?.configured) {
        setRoomId(data.data.roomId || "");
        setRoomPassword(data.data.roomPassword || "");
        setRevealed(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load room credentials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [matchId]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/matches/${encodeURIComponent(matchId)}/room`, { method: state?.configured ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, roomPassword, published }) });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.message || "Unable to update room credentials.");
      setMessage("Room credentials saved.");
      setRevealed(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update room credentials.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!window.confirm("Remove the active room credentials for this match?")) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/matches/${encodeURIComponent(matchId)}/room`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.message || "Unable to remove room credentials.");
      setMessage("Room credentials removed.");
      setRevealed(false);
      setRoomId("");
      setRoomPassword("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove room credentials.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !state) return <p className="text-sm text-slate-500">Loading room configuration...</p>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Room status</p><p className="mt-2 text-sm font-semibold text-white">{state?.configured ? state.published ? "Configured and published" : "Configured, not published" : "Not Configured"}</p></div>
          {state?.configured ? <Button type="button" variant="secondary" onClick={() => void load(!revealed)} disabled={loading}>{revealed ? "Hide Credentials" : "Reveal Credentials"}</Button> : null}
        </div>
      </div>

      <form onSubmit={save} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div><label htmlFor="room-id" className="text-sm font-semibold text-slate-200">Room ID</label><input id="room-id" value={roomId} onChange={(event) => setRoomId(event.target.value)} maxLength={120} required className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 font-mono text-sm text-white outline-none focus:border-lime-300/40" /></div>
        <div><label htmlFor="room-password" className="text-sm font-semibold text-slate-200">Room Password</label><input id="room-password" type={revealed ? "text" : "password"} value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} maxLength={200} required className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 font-mono text-sm text-white outline-none focus:border-lime-300/40" /></div>
        <label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> Publish to eligible participants</label>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving..." : state?.configured ? "Update Credentials" : "Save Credentials"}</Button>{state?.configured ? <Button type="button" variant="secondary" onClick={revoke} disabled={saving}>Remove Credentials</Button> : null}</div>
        {message ? <p role="status" className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-300">{message}</p> : null}
      </form>

      <p className="text-xs leading-5 text-slate-600">Passwords are masked by default, encrypted at rest, and are never written to audit logs. The server controls participant eligibility; final access timing will be added in Phase 9.9.</p>
    </div>
  );
}
