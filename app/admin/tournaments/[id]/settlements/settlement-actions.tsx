"use client";

import { useActionState } from "react";
import { approveSettlementAction, cancelSettlementAction, creditSettlementToWalletAction, generateSettlementsAction } from "./actions";

type SettlementActionState = { ok: boolean; message: string; code?: string; balance?: string };
const initial: SettlementActionState = { ok: false, message: "" };

async function generateAction(_state: SettlementActionState, formData: FormData) { return generateSettlementsAction(formData); }
async function approveAction(_state: SettlementActionState, formData: FormData) { return approveSettlementAction(formData); }
async function cancelAction(_state: SettlementActionState, formData: FormData) { return cancelSettlementAction(formData); }
async function creditAction(_state: SettlementActionState, formData: FormData) { return creditSettlementToWalletAction(formData); }

export function GenerateSettlementsForm({ tournamentId, disabled }: { tournamentId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(generateAction, initial);
  return <form action={action} className="space-y-2"><input type="hidden" name="tournamentId" value={tournamentId} /><button disabled={disabled || pending} className="rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">{pending ? "Generating…" : "Generate Settlements"}</button>{state.message ? <p className={`text-xs ${state.ok ? "text-lime-200" : "text-rose-300"}`}>{state.message}</p> : null}</form>;
}

export function SettlementRowActions({ tournamentId, settlementId, status, participant, amount, currency }: { tournamentId: string; settlementId: string; status: "PENDING" | "APPROVED" | "CREDITED" | "CANCELLED"; participant: string; amount: string; currency: string }) {
  const [approveState, approveFormAction, approvePending] = useActionState(approveAction, initial);
  const [cancelState, cancelFormAction, cancelPending] = useActionState(cancelAction, initial);
  const [creditState, creditFormAction, creditPending] = useActionState(creditAction, initial);

  return <div className="flex flex-wrap items-center gap-2">
    {status === "PENDING" ? <>
      <form action={approveFormAction}><input type="hidden" name="tournamentId" value={tournamentId} /><input type="hidden" name="settlementId" value={settlementId} /><button disabled={approvePending} className="rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-40">{approvePending ? "Approving…" : "Approve"}</button></form>
      <form action={cancelFormAction} onSubmit={(event) => { if (!window.confirm("Cancel this pending settlement? The record will remain in history and no wallet credit will occur.")) event.preventDefault(); }}><input type="hidden" name="tournamentId" value={tournamentId} /><input type="hidden" name="settlementId" value={settlementId} /><button disabled={cancelPending} className="rounded-lg border border-rose-300/30 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-40">{cancelPending ? "Cancelling…" : "Cancel"}</button></form>
    </> : null}
    {status === "APPROVED" ? <form action={creditFormAction} onSubmit={(event) => { if (!window.confirm(`Winner: ${participant}\nPrize: ₹${amount}\nDestination: ${participant}'s PlayerLobby Wallet\nCurrency: ${currency}\n\nThis credits the amount to the PlayerLobby wallet. It does not transfer money to a bank account or UPI.\n\nContinue?`)) event.preventDefault(); }}><input type="hidden" name="tournamentId" value={tournamentId} /><input type="hidden" name="settlementId" value={settlementId} /><button disabled={creditPending} className="rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-40">{creditPending ? "Crediting…" : `Credit ₹${amount} to Wallet`}</button></form> : null}
    {status === "CREDITED" ? <span className="rounded-lg bg-lime-300/10 px-3 py-2 text-xs font-bold text-lime-200">Credited</span> : null}
    {approveState.message ? <span className={`text-xs ${approveState.ok ? "text-lime-200" : "text-rose-300"}`}>{approveState.message}</span> : null}
    {cancelState.message ? <span className={`text-xs ${cancelState.ok ? "text-lime-200" : "text-rose-300"}`}>{cancelState.message}</span> : null}
    {creditState.message ? <span className={`text-xs ${creditState.ok ? "text-lime-200" : "text-rose-300"}`}>{creditState.message}{creditState.balance ? ` · Balance ₹${creditState.balance}` : ""}</span> : null}
  </div>;
}
