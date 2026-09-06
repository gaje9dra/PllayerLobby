"use client";

import { useActionState } from "react";
import { cancelTournament, type CancelTournamentState } from "@/app/admin/tournaments/actions";

const initialState: CancelTournamentState = { ok: false };

export function CancelTournamentButton({ tournamentId, disabled = false }: { tournamentId: string; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(cancelTournament, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Are you sure you want to cancel this tournament?\n\nCancellation will prevent the tournament from proceeding. Existing registrations and payment records will be preserved.")) {
          event.preventDefault();
        }
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-400/10 px-5 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Cancelling..." : "Cancel Tournament"}
      </button>
      {state.error ? <p role="alert" className="text-xs font-medium text-rose-300">{state.error}</p> : null}
    </form>
  );
}
