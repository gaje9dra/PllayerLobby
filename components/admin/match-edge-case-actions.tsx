"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { abandonMatchAction, cancelMatchAction, markNoShowAction, type EdgeActionState } from "@/app/admin/tournaments/edge-actions";

const initial: EdgeActionState = { ok: false };

export function MatchEdgeCaseActions({ tournamentId, matchId, participants, status }: { tournamentId: string; matchId: string; participants: Array<{ registrationId: string | null; participantName?: string | null; slotNumber: number }>; status: string }) {
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelMatchAction, initial);
  const [abandonState, abandonAction, abandonPending] = useActionState(abandonMatchAction, initial);
  const [noShowState, noShowAction, noShowPending] = useActionState(markNoShowAction, initial);
  const active = ["PENDING", "READY", "LIVE"].includes(status);
  const abandonable = ["READY", "LIVE"].includes(status);
  const cancellable = ["PENDING", "READY", "LIVE", "ABANDONED"].includes(status);
  return <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
    <h2 className="text-sm font-bold text-white">Edge-case controls</h2>
    <p className="mt-1 text-xs text-slate-500">Administrative actions are server-authorized, transactional and audited.</p>
    <div className="mt-4 grid gap-4">
      {cancellable ? <form action={cancelAction} onSubmit={(e) => { const reason = window.prompt("Why are you cancelling this match?"); if (!reason?.trim() || !window.confirm("Cancel this match? This prevents room access, normal result submission and winner advancement.")) e.preventDefault(); else { const input = e.currentTarget.elements.namedItem("reason") as HTMLInputElement; input.value = reason.trim(); } }} className="flex flex-wrap gap-2"><input type="hidden" name="tournamentId" value={tournamentId}/><input type="hidden" name="matchId" value={matchId}/><input type="hidden" name="reason"/><Button type="submit" variant="secondary" disabled={cancelPending}>{cancelPending ? "Cancelling..." : "Cancel Match"}</Button>{cancelState.message ? <span className="self-center text-xs text-slate-400">{cancelState.message}</span> : null}</form> : null}
      {abandonable ? <form action={abandonAction} onSubmit={(e) => { const reason = window.prompt("Why is this match being marked abandoned?"); if (!reason?.trim()) e.preventDefault(); else { const input = e.currentTarget.elements.namedItem("reason") as HTMLInputElement; input.value = reason.trim(); } }} className="flex flex-wrap gap-2"><input type="hidden" name="tournamentId" value={tournamentId}/><input type="hidden" name="matchId" value={matchId}/><input type="hidden" name="reason"/><Button type="submit" variant="secondary" disabled={abandonPending}>{abandonPending ? "Saving..." : "Mark Abandoned"}</Button>{abandonState.message ? <span className="self-center text-xs text-slate-400">{abandonState.message}</span> : null}</form> : null}
      {active ? <div className="grid gap-2">{participants.filter((p) => p.registrationId).map((p) => <form key={p.registrationId} action={noShowAction} onSubmit={(e) => { const reason = window.prompt(`Reason for marking ${p.participantName ?? "this participant"} as no-show:`); if (!reason?.trim()) e.preventDefault(); else { const input = e.currentTarget.elements.namedItem("reason") as HTMLInputElement; input.value = reason.trim(); } }} className="flex flex-wrap items-center gap-2"><input type="hidden" name="tournamentId" value={tournamentId}/><input type="hidden" name="matchId" value={matchId}/><input type="hidden" name="registrationId" value={p.registrationId ?? ""}/><input type="hidden" name="reason"/><Button type="submit" variant="secondary" disabled={noShowPending}>{noShowPending ? "Saving..." : `Mark ${p.participantName ?? `Slot ${p.slotNumber}`} No-Show`}</Button></form>)}</div> : null}
      {!cancellable && !abandonable && !active ? <p className="text-xs text-slate-500">No edge-case actions are valid for this match state.</p> : null}
      {noShowState.message ? <p className="text-xs text-slate-400">{noShowState.message}</p> : null}
    </div>
  </section>;
}
