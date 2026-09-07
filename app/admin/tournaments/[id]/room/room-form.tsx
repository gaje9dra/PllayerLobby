"use client";

import { useActionState } from "react";
import { saveTournamentRoom, type RoomActionState } from "@/app/admin/tournaments/[id]/room/actions";
import { Button } from "@/components/ui/button";

const INITIAL: RoomActionState = { ok: false };

type RoomData = { roomId: string; roomPassword: string; publishedAt: Date | null; revokedAt: Date | null } | null;

export function RoomForm({ tournamentId, room, disabled }: { tournamentId: string; room: RoomData; disabled: boolean }) {
  const [state, action, pending] = useActionState(saveTournamentRoom, INITIAL);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <div>
        <label htmlFor="room-id" className="text-sm font-semibold text-slate-200">Room ID</label>
        <input id="room-id" name="roomId" defaultValue={room?.roomId ?? ""} maxLength={120} autoComplete="off" disabled={disabled || pending} required className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none placeholder:text-slate-700 focus:border-lime-300/40" />
      </div>
      <div>
        <label htmlFor="room-password" className="text-sm font-semibold text-slate-200">Room Password</label>
        <input id="room-password" name="roomPassword" type="password" defaultValue={room?.roomPassword ?? ""} maxLength={200} autoComplete="new-password" disabled={disabled || pending} required className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none placeholder:text-slate-700 focus:border-lime-300/40" />
      </div>
      <label className="flex items-center gap-3 text-sm text-slate-300">
        <input type="checkbox" name="published" defaultChecked={!!room?.publishedAt && !room?.revokedAt} disabled={disabled || pending} className="size-4 rounded border-white/20 bg-slate-950 accent-lime-300" />
        Publish room for the participant joining window
      </label>
      <Button type="submit" disabled={disabled || pending}>{pending ? "Saving..." : room ? "Update Room" : "Create Room"}</Button>
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-lime-300" : "text-red-300"}`}>{state.message}</p> : null}
    </form>
  );
}
