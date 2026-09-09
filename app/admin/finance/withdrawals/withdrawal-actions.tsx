"use client";

import { useActionState, useState } from "react";
import { approveWithdrawalAction, checkPayoutStatusAction, processPayoutAction, rejectWithdrawalAction, type AdminWithdrawalActionState } from "@/app/admin/finance/withdrawals/actions";

const initial: AdminWithdrawalActionState = { ok: false };

export function WithdrawalActions({ withdrawalId, status, payoutId, destinationType }: { withdrawalId: string; status: string; payoutId?: string; destinationType?: "UPI" | "BANK_ACCOUNT" }) {
  const [approveState, approve, approving] = useActionState(approveWithdrawalAction, initial);
  const [rejectState, reject, rejecting] = useActionState(rejectWithdrawalAction, initial);
  const [processState, process, processing] = useActionState(processPayoutAction, initial);
  const [checkState, check, checking] = useActionState(checkPayoutStatusAction, initial);
  const [reason, setReason] = useState("");

  if (status === "PENDING") return <div className="space-y-3">
    <form action={approve} onSubmit={(event) => { if (!window.confirm("Approve this withdrawal request? This does not initiate a PayU transfer.")) event.preventDefault(); }}><input type="hidden" name="withdrawalId" value={withdrawalId} /><button type="submit" disabled={approving || rejecting} className="w-full rounded-lg bg-lime-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{approving ? "Approving…" : "Approve"}</button></form>
    <form action={reject}><input type="hidden" name="withdrawalId" value={withdrawalId} /><input name="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} required placeholder="Rejection reason" className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none" /><button type="submit" disabled={approving || rejecting} className="mt-2 w-full rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50">{rejecting ? "Rejecting…" : "Reject"}</button></form>
    {approveState.message ? <p role="status" className={`text-xs ${approveState.ok ? "text-lime-200" : "text-rose-200"}`}>{approveState.message}</p> : null}
    {rejectState.message ? <p role="status" className={`text-xs ${rejectState.ok ? "text-lime-200" : "text-rose-200"}`}>{rejectState.message}</p> : null}
  </div>;

  if (status === "APPROVED") return <div className="space-y-3"><form action={process} onSubmit={(event) => { if (!window.confirm("Send this approved withdrawal to PayU? The transfer will use the immutable withdrawal destination snapshot.")) event.preventDefault(); }}><input type="hidden" name="withdrawalId" value={withdrawalId} /><input type="hidden" name="retry" value="false" />{destinationType === "BANK_ACCOUNT" ? <select name="paymentType" defaultValue="IMPS" className="mb-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white"><option value="IMPS">IMPS</option><option value="NEFT">NEFT</option><option value="RTGS">RTGS</option></select> : <input type="hidden" name="paymentType" value="UPI" />}<button type="submit" disabled={processing} className="w-full rounded-lg bg-lime-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{processing ? "Sending to PayU…" : "Process Payout"}</button></form>{processState.message ? <p role="status" className={`text-xs ${processState.ok ? "text-lime-200" : "text-rose-200"}`}>{processState.message}</p> : null}</div>;

  if (status === "PAYOUT_INITIATED" || status === "PROCESSING") return <div className="space-y-2">{payoutId ? <form action={check}><input type="hidden" name="payoutId" value={payoutId} /><button type="submit" disabled={checking} className="w-full rounded-lg border border-amber-300/20 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50">{checking ? "Checking PayU…" : "Check PayU Status"}</button></form> : null}<p className="text-[11px] text-slate-500">No retry is allowed while the transfer is uncertain or processing.</p>{checkState.message ? <p role="status" className={`text-xs ${checkState.ok ? "text-lime-200" : "text-rose-200"}`}>{checkState.message}</p> : null}</div>;

  if (status === "FAILED") return <div className="space-y-2"><form action={process} onSubmit={(event) => { if (!window.confirm("PayU has definitively failed the previous transfer. Create a new payout attempt with a new merchant reference?")) event.preventDefault(); }}><input type="hidden" name="withdrawalId" value={withdrawalId} /><input type="hidden" name="retry" value="true" /><input type="hidden" name="paymentType" value={destinationType === "UPI" ? "UPI" : "IMPS"} /><button type="submit" disabled={processing} className="w-full rounded-lg border border-lime-300/20 px-3 py-2 text-xs font-bold text-lime-200 disabled:opacity-50">{processing ? "Retrying…" : "Retry Failed Payout"}</button></form><p className="text-[11px] text-slate-500">Retry is available only after PayU has definitively reported failure; the previous payout remains immutable history.</p>{processState.message ? <p role="status" className={`text-xs ${processState.ok ? "text-lime-200" : "text-rose-200"}`}>{processState.message}</p> : null}</div>;

  if (status === "REVERSED") return <span className="text-xs font-semibold text-amber-200">Reconciliation required</span>;
  if (status === "PAID") return <span className="text-xs font-semibold text-lime-200">Paid</span>;
  return <span className="text-xs font-semibold text-slate-500">No action</span>;
}
