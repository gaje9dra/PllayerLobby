"use client";

import { useActionState, useRef } from "react";
import { createWithdrawalAction, type WithdrawalActionState } from "@/app/dashboard/wallet/withdraw/actions";

const initialState: WithdrawalActionState = { ok: false };

export function WithdrawForm({ availableBalance, currency, minimumAmount, maximumAmount }: { availableBalance: string; currency: string; minimumAmount: string; maximumAmount: string | null }) {
  const [state, action, pending] = useActionState(createWithdrawalAction, initialState);
  const idempotencyKey = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

  return <form action={action} className="mt-6 space-y-5">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey.current} />
    <div>
      <label htmlFor="withdrawal-amount" className="text-sm font-semibold text-slate-200">Withdrawal amount</label>
      <div className="mt-2 flex overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-lime-300/50">
        <span className="flex items-center px-4 text-slate-400">₹</span>
        <input id="withdrawal-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" required placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-white outline-none" aria-describedby="withdrawal-limits" />
      </div>
      <p id="withdrawal-limits" className="mt-2 text-xs text-slate-500">Minimum: ₹{minimumAmount}{maximumAmount ? ` · Maximum: ₹${maximumAmount}` : ""} · Currency: {currency}</p>
    </div>
    {state.message ? <div role="status" className={`rounded-xl border p-4 text-sm ${state.ok ? "border-lime-300/20 bg-lime-300/10 text-lime-100" : "border-rose-300/20 bg-rose-300/10 text-rose-100"}`}>{state.message}</div> : null}
    <button type="submit" disabled={pending} className="w-full rounded-xl bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Submitting…" : "Submit withdrawal request"}</button>
    <p className="text-xs leading-5 text-slate-500">This phase only creates a withdrawal request for review. No bank, UPI, or external payout transfer is performed.</p>
    <p className="text-xs text-slate-500">Available for withdrawal: <span className="font-bold text-slate-300">₹{availableBalance}</span></p>
  </form>;
}
