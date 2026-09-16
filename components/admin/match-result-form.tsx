"use client";

import { useState } from "react";

export function MatchResultForm({ matchId, participants }: { matchId: string; participants: Array<{ slotNumber: number; registrationId: string | null; participantName: string | null }> }) {
  const active = participants.filter((p): p is { slotNumber: number; registrationId: string; participantName: string | null } => Boolean(p.registrationId));
  const [winner, setWinner] = useState(active[0]?.registrationId ?? "");
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(active.map((p) => [p.registrationId, ""])));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const normalized: Record<string, number> = {};
      for (const participant of active) {
        const value = Number(scores[participant.registrationId]);
        if (!Number.isFinite(value) || value < 0) throw new Error("Enter a valid non-negative score for every participant.");
        normalized[participant.registrationId] = value;
      }
      const response = await fetch(`/api/matches/${matchId}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ winnerRegistrationId: winner, scores: normalized }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Unable to submit result.");
      setMessage("Result submitted for verification.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit result.");
    } finally {
      setBusy(false);
    }
  }

  if (active.length < 2) return <p className="text-sm text-amber-300">This match does not currently have two participants.</p>;
  return <form onSubmit={submit} className="space-y-5"><div className="space-y-3">{active.map((participant) => <div key={participant.registrationId} className="grid gap-2 sm:grid-cols-[1fr_140px]"><label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200"><input type="radio" name="winner" checked={winner === participant.registrationId} onChange={() => setWinner(participant.registrationId)} />{participant.participantName || "Participant"}</label><input value={scores[participant.registrationId] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [participant.registrationId]: event.target.value }))} inputMode="decimal" min="0" step="any" placeholder="Score" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" /></div>)}</div><button disabled={busy} className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{busy ? "Submitting…" : "Submit Result"}</button>{message ? <p className="text-sm text-slate-400">{message}</p> : null}</form>;
}
