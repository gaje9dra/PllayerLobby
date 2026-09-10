"use client";

import { useActionState, useState } from "react";
import { approveWithdrawalAction, checkPayoutStatusAction, processPayoutAction, rejectWithdrawalAction, retryPayoutAction, type AdminWithdrawalActionState } from "@/app/admin/finance/withdrawals/actions";

const initial: AdminWithdrawalActionState = { ok: false };
type Props = { withdrawalId: string; status: string; payoutId?: string | null; destinationType?: string | null; paymentType?: string | null; reconciliationStatus?: string | null };

export function WithdrawalActions({ withdrawalId, status, payoutId, destinationType, paymentType, reconciliationStatus }: Props) {
  const [approveState, approve, approving] = useActionState(approveWithdrawalAction, initial);
  const [rejectState, reject, rejecting] = useActionState(rejectWithdrawalAction, initial);
  const [processState, process, processing] = useActionState(processPayoutAction, initial);
  const [checkState, check, checking] = useActionState(checkPayoutStatusAction, initial);
  const [retryState, retry, retrying] = useActionState(retryPayoutAction, initial);
  const [reason, setReason] = useState("");
  const defaultType = destinationType === "UPI" ? "UPI" : (paymentType === "NEFT" || paymentType === "RTGS" || paymentType === "IMPS" ? paymentType : "IMPS");
  const bankOptions = <><option value="IMPS">IMPS</option><option value="NEFT">NEFT</option><option value="RTGS">RTGS</option></>;
  const needsReconciliation = payoutId && ["PENDING", "REQUIRED", "MISMATCH", "CONFLICT"].includes(reconciliationStatus ?? "");

  if (status === "PENDING") return <div className="space-y-3">
    <form action={approve} onSubmit={(event) => { if (!window.confirm("Approve this withdrawal request?")) event.preventDefault(); }}><input type="hidden" name="withdrawalId" value={withdrawalId} /><button type="submit" disabled={approving || rejecting} className="w-full rounded-lg bg-lime-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{approving ? "Approving…" : "Approve"}</button></form>
    <form action={reject}><input type="hidden" name="withdrawalId" value={withdrawalId} /><input name="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} required placeholder="Rejection reason" className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none" /><button type="submit" disabled={approving || rejecting} className="mt-2 w-full rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50">{rejecting ? "Rejecting…" : "Reject"}</button></form>
    {approveState.message ? <p role="status" className={`text-xs ${approveState.ok ? "text-lime-200" : "text-rose-200"}`}>{approveState.message}</p> : null}{rejectState.message ? <p role="status" className={`text-xs ${rejectState.ok ? "text-lime-200" : "text-rose-200"}`}>{rejectState.message}</p> : null}
  </div>;

  if (status === "APPROVED") return <div className="space-y-2">
    <form action={process}><input type="hidden" name="withdrawalId" value={withdrawalId} /><label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Payment type</label><select name="paymentType" defaultValue={defaultType} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white">{destinationType === "UPI" ? <option value="UPI">UPI</option> : bankOptions}</select><button type="submit" disabled={processing} className="w-full rounded-lg bg-lime-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{processing ? "Sending to PayU…" : "Process payout"}</button></form>
    {processState.message ? <p role="status" className={`text-xs ${processState.ok ? "text-lime-200" : "text-rose-200"}`}>{processState.message}</p> : null}
  </div>;

  if (payoutId && (status === "PAYOUT_INITIATED" || status === "PROCESSING" || needsReconciliation)) return <div className="space-y-2">
    <form action={check}><input type="hidden" name="payoutId" value={payoutId} /><button type="submit" disabled={checking} className="w-full rounded-lg border border-amber-300/20 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50">{checking ? "Checking…" : "Reconcile PayU status"}</button></form>
    {status === "PAYOUT_INITIATED" || status === "PROCESSING" ? <p className="text-[11px] text-slate-500">No retry while the transfer is unresolved.</p> : null}{checkState.message ? <p role="status" className={`text-xs ${checkState.ok ? "text-lime-200" : "text-rose-200"}`}>{checkState.message}</p> : null}
  </div>;

  if (status === "FAILED") return <div className="space-y-2">
    <form action={retry}><input type="hidden" name="withdrawalId" value={withdrawalId} /><label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Retry payment type</label><select name="paymentType" defaultValue={defaultType} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white">{destinationType === "UPI" ? <option value="UPI">UPI</option> : bankOptions}</select><button type="submit" disabled={retrying} className="mt-2 w-full rounded-lg border border-amber-300/20 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50">{retrying ? "Retrying…" : "Retry failed payout"}</button></form>
    {retryState.message ? <p role="status" className={`text-xs ${retryState.ok ? "text-lime-200" : "text-rose-200"}`}>{retryState.message}</p> : null}
  </div>;

  if (status === "PAID") return <span className="text-xs font-semibold text-lime-200">Paid</span>;
  if (status === "REVERSED") return <span className="text-xs font-semibold text-amber-200">Reversed — no automatic retry</span>;
  return <span className="text-xs font-semibold text-slate-500">No action</span>;
}
