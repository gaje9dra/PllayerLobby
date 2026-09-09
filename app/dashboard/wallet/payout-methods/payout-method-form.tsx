"use client";

import { useActionState } from "react";
import { createPayoutDestinationAction, type PayoutDestinationActionState } from "@/app/dashboard/wallet/payout-methods/actions";

const initialState: PayoutDestinationActionState = { ok: false };

export function PayoutMethodForm({ type }: { type: "UPI" | "BANK_ACCOUNT" }) {
  const [state, action, pending] = useActionState(createPayoutDestinationAction, initialState);
  return <form action={action} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
    <input type="hidden" name="type" value={type} />
    <h2 className="text-lg font-bold text-white">Add {type === "UPI" ? "UPI" : "bank account"}</h2>
    <div><label className="text-sm font-semibold text-slate-200" htmlFor={`${type}-displayName`}>Display name</label><input id={`${type}-displayName`} name="displayName" required maxLength={100} placeholder="My payout method" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" /></div>
    {type === "UPI" ? <div><label className="text-sm font-semibold text-slate-200" htmlFor="UPI-upiId">UPI ID / VPA</label><input id="UPI-upiId" name="upiId" required maxLength={320} autoComplete="off" placeholder="name@upi" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" /><p className="mt-2 text-xs text-slate-500">Never enter a UPI PIN or OTP.</p></div> : <>
      <div><label className="text-sm font-semibold text-slate-200" htmlFor="BANK_ACCOUNT-accountHolderName">Account holder name</label><input id="BANK_ACCOUNT-accountHolderName" name="accountHolderName" required maxLength={100} autoComplete="name" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" /></div>
      <div><label className="text-sm font-semibold text-slate-200" htmlFor="BANK_ACCOUNT-accountNumber">Account number</label><input id="BANK_ACCOUNT-accountNumber" name="accountNumber" required maxLength={18} inputMode="numeric" autoComplete="off" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" /></div>
      <div><label className="text-sm font-semibold text-slate-200" htmlFor="BANK_ACCOUNT-ifsc">IFSC</label><input id="BANK_ACCOUNT-ifsc" name="ifsc" required maxLength={11} autoComplete="off" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white uppercase outline-none focus:border-lime-300/50" /></div>
      <div><label className="text-sm font-semibold text-slate-200" htmlFor="BANK_ACCOUNT-bankName">Bank name</label><input id="BANK_ACCOUNT-bankName" name="bankName" required maxLength={100} autoComplete="organization" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" /></div>
      <p className="text-xs text-slate-500">Never enter an ATM PIN, CVV, internet-banking password, or OTP.</p>
    </>}
    {state.message ? <div role="status" className={`rounded-xl border p-3 text-sm ${state.ok ? "border-lime-300/20 bg-lime-300/10 text-lime-100" : "border-rose-300/20 bg-rose-300/10 text-rose-100"}`}>{state.message}</div> : null}
    <button type="submit" disabled={pending} className="rounded-xl bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{pending ? "Saving…" : "Add payout destination"}</button>
  </form>;
}
