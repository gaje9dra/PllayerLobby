"use client";

import { useActionState, useState } from "react";
import { approveWithdrawalAction, rejectWithdrawalAction, type AdminWithdrawalActionState } from "@/app/admin/finance/withdrawals/actions";

const initial: AdminWithdrawalActionState = { ok: false };

export function WithdrawalActions({ withdrawalId, status }: { withdrawalId: string; status: string }) {
  const [approveState, approve, approving] = useActionState(approveWithdrawalAction, initial);
  const [rejectState, reject, rejecting] = useActionState(rejectWithdrawalAction, initial);
  const [reason, setReason] = useState("");

  if (status !== "PENDING") return <span className="text-xs font-semibold text-slate-500">No action</span>;

  return <div className="space-y-3">
    <form action={approve} onSubmit={(event) => { if (!window.confirm("Approve this withdrawal request? This records admin approval only; no bank, UPI, or external payout will occur.")) event.preventDefault(); }}>
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button type="submit" disabled={approving || rejecting} className="w-full rounded-lg bg-lime-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{approving ? "Approving…" : "Approve"}</button>
    </form>
    <form action={reject}>
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <input name="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} required placeholder="Rejection reason" className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none" />
      <button type="submit" disabled={approving || rejecting} className="mt-2 w-full rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50">{rejecting ? "Rejecting…" : "Reject"}</button>
    </form>
    {approveState.message ? <p role="status" className={`text-xs ${approveState.ok ? "text-lime-200" : "text-rose-200"}`}>{approveState.message}</p> : null}
    {rejectState.message ? <p role="status" className={`text-xs ${rejectState.ok ? "text-lime-200" : "text-rose-200"}`}>{rejectState.message}</p> : null}
  </div>;
}
