"use client";

import { useActionState } from "react";
import { disableTournamentRoom, type RoomActionState } from "@/app/admin/tournaments/[id]/room/actions";
import { Button } from "@/components/ui/button";

const INITIAL: RoomActionState = { ok: false };

export function RoomDisableForm({ tournamentId, disabled }: { tournamentId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(disableTournamentRoom, INITIAL);
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <Button type="submit" variant="secondary" disabled={disabled || pending}>{pending ? "Disabling..." : "Disable Room Access"}</Button>
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`mt-3 text-sm ${state.ok ? "text-lime-300" : "text-red-300"}`}>{state.ok ? "Room access disabled." : state.message}</p> : null}
    </form>
  );
}
