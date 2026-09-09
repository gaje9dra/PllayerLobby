"use client";

import { useActionState } from "react";
import { disablePayoutDestinationAction, type PayoutDestinationActionState } from "@/app/dashboard/wallet/payout-methods/actions";

const initialState: PayoutDestinationActionState = { ok: false };

export function DestinationDisable({ destinationId }: { destinationId: string }) {
  const [state, action, pending] = useActionState(disablePayoutDestinationAction, initialState);
  return <form action={action} className="mt-3">
    <input type="hidden" name="destinationId" value={destinationId} />
    {state.message ? <p role="status" className="mb-2 text-xs text-slate-400">{state.message}</p> : null}
    <button type="submit" disabled={pending} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:border-rose-300/30 hover:text-rose-200 disabled:opacity-50">{pending ? "Disabling…" : "Disable"}</button>
  </form>;
}
