import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { formatDepositStatus } from "@/lib/deposit-rules";
import { getCurrentUserDeposit } from "@/lib/wallet-deposit";
import { cancelDepositAction } from "@/app/dashboard/wallet/deposit/[id]/actions";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusClass(status: string) {
  if (status === "SUCCESS") return "border-lime-300/20 bg-lime-300/10 text-lime-200";
  if (status === "FAILED" || status === "CANCELLED") return "border-rose-300/20 bg-rose-300/5 text-rose-200";
  return "border-amber-300/20 bg-amber-300/5 text-amber-200";
}

export default async function DepositPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deposit = await getCurrentUserDeposit(id);
  if (!deposit) notFound();

  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/dashboard/wallet" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Wallet</Link>
    <div className="mt-5 max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Deposit</p>
      <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Add money status</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">This page reads the deposit state from the server. Refreshing it never assumes that payment succeeded.</p>
    </div>

    <section className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Amount</p><p className="mt-1 text-3xl font-black text-white">₹{deposit.amount.toFixed(2)}</p><p className="mt-1 text-xs text-slate-500">{deposit.currency}</p></div>
        <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wide ${statusClass(deposit.status)}`}>{statusLabel(deposit.status)}</span>
      </div>

      <dl className="mt-7 grid gap-4 border-t border-white/5 pt-6 sm:grid-cols-2">
        <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Deposit reference</dt><dd className="mt-1 break-all font-mono text-sm font-bold text-slate-200">{deposit.reference}</dd></div>
        <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Created</dt><dd className="mt-1 text-sm text-slate-300">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(deposit.createdAt)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Current state</dt><dd className="mt-1 text-sm leading-6 text-slate-300">{formatDepositStatus(deposit.status)}</dd></div>
      </dl>

      {deposit.status === "PENDING" ? <div className="mt-7 flex flex-col gap-3 border-t border-white/5 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">Payment checkout is not enabled in this phase. You may safely leave or cancel this pending request.</p><form action={cancelDepositAction}><input type="hidden" name="depositId" value={deposit.id} /><Button type="submit" variant="secondary">Cancel deposit</Button></form></div> : null}
      {deposit.status === "SUCCESS" ? <div className="mt-7 rounded-xl border border-lime-300/15 bg-lime-300/5 p-4 text-sm font-semibold text-lime-200">A later verified payment flow can credit the wallet exactly once for this deposit. This phase does not perform that credit.</div> : null}
    </section>
  </SectionContainer>;
}
