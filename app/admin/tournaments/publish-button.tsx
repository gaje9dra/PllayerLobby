"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { publishTournamentNow, type PublishTournamentState } from "@/app/admin/tournaments/publish-action";

const INITIAL: PublishTournamentState = { ok: false };

export function PublishTournamentButton({ tournamentId, disabled = false }: { tournamentId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(publishTournamentNow, INITIAL);
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <Button type="submit" disabled={disabled || pending}>{pending ? "Publishing…" : "Publish Tournament"}</Button>
      </form>
      {state.error ? <p className="mt-2 text-xs text-rose-300" role="alert">{state.error}</p> : null}
    </div>
  );
}
