"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { finalizePrizesAction } from "./actions";

type State = { error?: string };

export function FinalizePrizeForm({ tournamentId, disabled }: { tournamentId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(async (_prev: State, formData: FormData): Promise<State> => {
    try { await finalizePrizesAction(formData); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "Unable to finalize prizes." }; }
  }, {});
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Finalize this prize configuration? Once finalized, ordinary editing will be locked.")) event.preventDefault(); }}><input type="hidden" name="tournamentId" value={tournamentId}/><Button type="submit" disabled={disabled || pending}>{pending ? "Finalizing…" : "Finalize Prize Configuration"}</Button>{state.error ? <p className="mt-2 text-sm text-red-300">{state.error}</p> : null}</form>;
}
