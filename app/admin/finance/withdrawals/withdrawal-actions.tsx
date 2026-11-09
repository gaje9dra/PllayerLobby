"use client";

import { useActionState, useState } from "react";
import { approveWithdrawalAction, markManualWithdrawalPaidAction, rejectWithdrawalAction, type AdminWithdrawalActionState } from "@/app/admin/finance/withdrawals/actions";

const initial: AdminWithdrawalActionState = { ok: false };
type Props = { withdrawalId: string; status: string };

export function WithdrawalActions({ withdrawalId, status }: Props) {
  const [approveState, approve, approving] = useActionState(approveWithdrawalAction, initial);
  const [rejectState, reject, rejecting] = useActionState(rejectWithdrawalAction, initial);
  const [paidState, markPaid, markingPaid] = useActionState(markManualWithdrawalPaidAction, initial);
  const [reason, setReason] = useState("");

  if (status === "PENDING") return <div className="space-y-3">
    <form action={approve} onSubmit={(event) => { if (!window.confirm("Approve this withdrawal request? You will still need to send the money manually.")) event.preventDefault(); }}>
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button type="submit" disabled={approving || rejecting} className="w-full rounded-lg bg-lime-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{approving ? "Approving…" : "Approve request"}</button>
    </form>
    <form action={reject}>
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <input name="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} required placeholder="Rejection reason" className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none" />
      <button type="submit" disabled={approving || rejecting} className="mt-2 w-full rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50">{rejecting ? "Rejecting…" : "Reject request"}</button>
    </form>
    {approveState.message ? <p role="status" className={`text-xs ${approveState.ok ? "text-lime-200" : "text-rose-200"}`}>{approveState.message}</p> : null}
    {rejectState.message ? <p role="status" className={`text-xs ${rejectState.ok ? "text-lime-200" : "text-rose-200"}`}>{rejectState.message}</p> : null}
  </div>;

  if (status === "APPROVED") return <div className="space-y-2">
    <p className="text-[11px] leading-5 text-amber-200">First send the exact amount to the payout destination above using your bank/UPI app. Only then record it here.</p>
    <form action={markPaid} onSubmit={(event) => { if (!window.confirm("Confirm that you have already sent the full withdrawal amount to the user? This will debit their PlayerLobby wallet and mark the request PAID.")) event.preventDefault(); }}>
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Bank / UPI transaction reference</label>
      <input name="paymentReference" minLength={4} maxLength={128} required placeholder="Enter UTR / UPI transaction ID" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none" />
      <button type="submit" disabled={markingPaid} className="mt-2 w-full rounded-lg bg-lime-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{markingPaid ? "Recording payment…" : "Confirm manual payment sent"}</button>
    </form>
    {paidState.message ? <p role="status" className={`text-xs ${paidState.ok ? "text-lime-200" : "text-rose-200"}`}>{paidState.message}</p> : null}
  </div>;

  if (status === "PAID") return <span className="text-xs font-semibold text-lime-200">Paid manually</span>;
  if (status === "REJECTED") return <span className="text-xs font-semibold text-rose-200">Rejected</span>;
  if (status === "CANCELLED") return <span className="text-xs font-semibold text-slate-500">Cancelled</span>;
  return <span className="text-xs font-semibold text-slate-500">No action</span>;
}
