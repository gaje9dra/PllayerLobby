"use client";

import { useActionState } from "react";
import { cancelWithdrawalAction, type WithdrawalActionState } from "@/app/dashboard/wallet/withdraw/actions";

export function WithdrawCancel({ withdrawalId }: { withdrawalId: string }) {
  const initial: WithdrawalActionState = { ok: false };
  const [state, action, pending] = useActionState(cancelWithdrawalAction, initial);
  return <form action={action}>
    <input type="hidden" name="withdrawalId" value={withdrawalId} />
    <button type="submit" disabled={pending} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:border-rose-300/30 hover:text-rose-200 disabled:opacity-50">{pending ? "Cancelling…" : "Cancel"}</button>
    {state.message ? <p role="status" className={`mt-2 text-xs ${state.ok ? "text-lime-200" : "text-rose-200"}`}>{state.message}</p> : null}
  </form>;
}
