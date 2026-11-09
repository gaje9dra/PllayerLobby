"use client";

import { useActionState, useEffect, useRef } from "react";
import { createPayoutDestinationAction, type PayoutDestinationActionState } from "@/app/dashboard/wallet/payout-methods/actions";

const initialState: PayoutDestinationActionState = { ok: false };

export function PayoutMethodForm({ type }: { type: "UPI" | "BANK_ACCOUNT" }) {
  const [state, action, pending] = useActionState(createPayoutDestinationAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const isUpi = type === "UPI";
  const title = isUpi ? "UPI ID" : "bank account";

  return <form ref={formRef} action={action} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
    <input type="hidden" name="type" value={type} />
    <div>
      <h2 className="text-lg font-bold text-white">Add {title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">{isUpi ? "Add the UPI ID where you want to receive eligible withdrawals." : "Enter the account details exactly as registered with your bank."}</p>
    </div>
    <div>
      <label className="text-sm font-semibold text-slate-200" htmlFor={`${type}-displayName`}>Display name</label>
      <input id={`${type}-displayName`} name="displayName" required maxLength={100} autoComplete="off" placeholder={isUpi ? "e.g. My UPI" : "e.g. Primary bank account"} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" />
      <p className="mt-1 text-xs text-slate-500">A private label to help you identify this payout method.</p>
    </div>
    {isUpi ? <div>
      <label className="text-sm font-semibold text-slate-200" htmlFor="UPI-upiId">UPI ID / VPA</label>
      <input id="UPI-upiId" name="upiId" type="text" required maxLength={320} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. name@okaxis" aria-describedby="UPI-upiId-help" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" />
      <p id="UPI-upiId-help" className="mt-2 text-xs text-slate-500">Enter your UPI ID only. Never enter a UPI PIN, OTP, or password.</p>
    </div> : <>
      <div>
        <label className="text-sm font-semibold text-slate-200" htmlFor="BANK_ACCOUNT-accountHolderName">Account holder name</label>
        <input id="BANK_ACCOUNT-accountHolderName" name="accountHolderName" type="text" required maxLength={100} autoComplete="name" autoCapitalize="words" placeholder="Name as registered with your bank" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" />
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-200" htmlFor="BANK_ACCOUNT-accountNumber">Bank account number</label>
        <input id="BANK_ACCOUNT-accountNumber" name="accountNumber" type="text" required maxLength={22} inputMode="numeric" autoComplete="off" autoCapitalize="none" spellCheck={false} pattern="[0-9 -]{9,22}" title="Enter 9 to 18 digits. Spaces or hyphens are optional." placeholder="9–18 digit account number" aria-describedby="BANK_ACCOUNT-accountNumber-help" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" />
        <p id="BANK_ACCOUNT-accountNumber-help" className="mt-1 text-xs text-slate-500">Enter 9–18 digits. Spaces or hyphens are optional.</p>
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-200" htmlFor="BANK_ACCOUNT-ifsc">IFSC code</label>
        <input id="BANK_ACCOUNT-ifsc" name="ifsc" type="text" required maxLength={11} autoComplete="off" autoCapitalize="characters" spellCheck={false} pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}" title="Enter an 11-character IFSC code, for example SBIN0001234." placeholder="e.g. SBIN0001234" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white uppercase outline-none focus:border-lime-300/50" />
        <p className="mt-1 text-xs text-slate-500">11 characters: 4 letters, 0, then 6 letters or digits.</p>
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-200" htmlFor="BANK_ACCOUNT-bankName">Bank name</label>
        <input id="BANK_ACCOUNT-bankName" name="bankName" type="text" required maxLength={100} autoComplete="organization" placeholder="e.g. State Bank of India" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-lime-300/50" />
      </div>
      <p className="text-xs text-slate-500">Never enter an ATM PIN, CVV, internet-banking password, or OTP.</p>
    </>}
    {state.message ? <div role={state.ok ? "status" : "alert"} aria-live={state.ok ? "polite" : "assertive"} className={`rounded-xl border p-3 text-sm ${state.ok ? "border-lime-300/20 bg-lime-300/10 text-lime-100" : "border-rose-300/20 bg-rose-300/10 text-rose-100"}`}>{state.message}</div> : null}
    <button type="submit" disabled={pending} className="w-full rounded-xl bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving payout details…" : isUpi ? "Save UPI ID" : "Save bank account"}</button>
  </form>;
}
