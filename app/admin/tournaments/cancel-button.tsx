"use client";

import { useActionState } from "react";
import { cancelTournamentAction, type EdgeActionState } from "@/app/admin/tournaments/edge-actions";

const initialState: EdgeActionState = { ok: false };

export function CancelTournamentButton({ tournamentId, disabled = false }: { tournamentId: string; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(cancelTournamentAction, initialState);
  return <form action={formAction} onSubmit={(event) => {
    const reason = window.prompt("Why are you cancelling this tournament?");
    if (!reason?.trim()) { event.preventDefault(); return; }
    if (!window.confirm("Cancel this tournament?\n\nThis affects registrations, matches, access and tournament progression. Historical data will be preserved.")) { event.preventDefault(); return; }
    const input = event.currentTarget.elements.namedItem("reason") as HTMLInputElement;
    input.value = reason.trim();
  }} className="grid gap-2">
    <input type="hidden" name="tournamentId" value={tournamentId} />
    <input type="hidden" name="reason" />
    <button type="submit" disabled={disabled || pending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-400/10 px-5 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:pointer-events-none disabled:opacity-50">{pending ? "Cancelling..." : "Cancel Tournament"}</button>
    {state.message ? <p role="status" className="text-xs font-medium text-slate-400">{state.message}</p> : null}
  </form>;
}
