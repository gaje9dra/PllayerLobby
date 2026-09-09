import Link from "next/link";
import { SectionContainer } from "@/components/ui/section-container";
import { getCurrentUserWithdrawalOverview, getCurrentUserWithdrawals } from "@/lib/withdrawal";
import { getCurrentUserPayoutDestinations } from "@/lib/payout-destination";
import { WithdrawForm } from "@/app/dashboard/wallet/withdraw/withdraw-form";
import { WithdrawCancel } from "@/app/dashboard/wallet/withdraw/withdraw-cancel";

function statusLabel(status: string) { return status.replaceAll("_", " "); }
function statusDescription(status: string) {
  const descriptions: Record<string, string> = {
    PENDING: "Your withdrawal is waiting for admin review.",
    APPROVED: "Your withdrawal is approved and can be sent to PayU.",
    PAYOUT_INITIATED: "The payout request was sent for processing. Final status is still pending.",
    PROCESSING: "Your withdrawal is being processed by PayU.",
    PAID: "Your withdrawal was successfully transferred.",
    FAILED: "The payout failed. Your reserved funds have been released.",
    REVERSED: "The payout was reversed and requires reconciliation.",
    REJECTED: "Your withdrawal request was rejected.",
    CANCELLED: "Your withdrawal request was cancelled.",
  };
  return descriptions[status] ?? "Withdrawal status updated.";
}

export default async function WithdrawPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [overview, history, destinations] = await Promise.all([getCurrentUserWithdrawalOverview(), getCurrentUserWithdrawals(safePage), getCurrentUserPayoutDestinations()]);

  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/dashboard/wallet" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Wallet</Link>
    <div className="mt-5 max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Withdraw</p><h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Request a withdrawal</h1><p className="mt-2 text-sm leading-6 text-slate-400">Withdrawal requests are reviewed by an active admin. Approved requests use the verified payout destination snapshot and may be sent to PayU for processing.</p></div>
    <div className="mt-8 grid gap-5 md:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Wallet balance</p><p className="mt-2 text-2xl font-black text-white">₹{overview.wallet?.balance.toFixed(2) ?? "0.00"}</p><p className="mt-1 text-xs text-slate-500">{overview.wallet?.currency ?? "INR"}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pending / approved</p><p className="mt-2 text-2xl font-black text-white">₹{overview.reservedAmount}</p><p className="mt-1 text-xs text-slate-500">Reserved for withdrawal requests</p></div><div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-5"><p className="text-xs font-bold uppercase tracking-wide text-lime-200">Available to withdraw</p><p className="mt-2 text-2xl font-black text-white">₹{overview.availableBalance}</p><p className="mt-1 text-xs text-slate-400">Calculated server-side</p></div></div>
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">New request</h2>{overview.wallet ? <WithdrawForm availableBalance={overview.availableBalance} currency={overview.wallet.currency} minimumAmount={overview.minimumAmount} maximumAmount={overview.maximumAmount} destinations={destinations} /> : <p className="mt-5 text-sm text-slate-500">Your wallet is not available yet.</p>}</section>
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><div className="flex items-end justify-between gap-4"><div><h2 className="text-lg font-bold text-white">Withdrawal history</h2><p className="mt-1 text-sm text-slate-500">{history.total} request{history.total === 1 ? "" : "s"}.</p></div></div>{history.items.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">No withdrawal requests yet.</div> : <div className="mt-5 space-y-3">{history.items.map((item) => <div key={item.id} className="rounded-xl border border-white/10 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-bold text-white">₹{item.amount.toFixed(2)} <span className="text-xs font-semibold text-slate-500">{item.currency}</span></p><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</p></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-300">{statusLabel(item.status)}</span></div><p className="mt-3 text-xs leading-5 text-slate-400">{statusDescription(item.status)}</p>{item.status === "REJECTED" && item.rejectionReason ? <p className="mt-3 text-xs text-rose-200">Reason: {item.rejectionReason}</p> : null}{item.status === "PENDING" ? <div className="mt-3"><WithdrawCancel withdrawalId={item.id} /></div> : null}</div>)}</div>}{history.totalPages > 1 ? <nav className="mt-5 flex items-center justify-between border-t border-white/5 pt-5"><Link className={safePage <= 1 ? "pointer-events-none text-slate-700" : "text-lime-300"} href={`/dashboard/wallet/withdraw?page=${safePage - 1}`}>← Previous</Link><span className="text-xs text-slate-500">Page {safePage} of {history.totalPages}</span><Link className={safePage >= history.totalPages ? "pointer-events-none text-slate-700" : "text-lime-300"} href={`/dashboard/wallet/withdraw?page=${safePage + 1}`}>Next →</Link></nav> : null}</section>
    </div>
  </SectionContainer>;
}
