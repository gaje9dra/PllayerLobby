import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionContainer } from "@/components/ui/section-container";
import { getCurrentUserDeposits } from "@/lib/wallet-deposit";
import { getCurrentUserWalletTransactions } from "@/lib/wallet";

function statusClass(status: string) {
  if (status === "SUCCESS") return "border-lime-300/20 bg-lime-300/10 text-lime-200";
  if (status === "FAILED" || status === "CANCELLED") return "border-rose-300/20 bg-rose-300/5 text-rose-200";
  return "border-amber-300/20 bg-amber-300/5 text-amber-200";
}

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  if (!Number.isSafeInteger(page) || page < 1) notFound();
  const [{ wallet, items, total, totalPages }, deposits] = await Promise.all([getCurrentUserWalletTransactions(page), getCurrentUserDeposits(1)]);
  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/dashboard" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Dashboard</Link>
    <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Wallet</p><h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Your wallet</h1><p className="mt-2 text-sm text-slate-400">Your financial balance is calculated from server-side wallet records.</p></div>
      <div className="flex flex-col items-stretch gap-3 sm:items-end"><div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 px-6 py-4 text-right"><p className="text-xs font-bold uppercase tracking-wide text-lime-200">Available balance</p><p className="mt-1 text-3xl font-black text-white">₹{wallet.balance.toFixed(2)}</p><p className="text-xs font-semibold text-slate-400">{wallet.currency}</p></div><div className="flex flex-wrap gap-2"><Link href="/dashboard/wallet/add-money" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-lime-300 px-5 text-sm font-semibold text-slate-950 shadow-sm shadow-lime-300/10 transition hover:bg-lime-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">Add money</Link><Link href="/dashboard/wallet/payout-methods" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-center text-sm font-bold text-slate-200 hover:border-lime-300/30 hover:text-lime-200">Payout methods</Link><Link href="/dashboard/wallet/withdraw" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-center text-sm font-bold text-slate-200 hover:border-lime-300/30 hover:text-lime-200">Withdraw funds</Link></div></div>
    </div>

    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-white">Deposit activity</h2><p className="mt-1 text-sm text-slate-500">Deposits are separate payment-state records until authoritative verification credits the ledger.</p></div><Link href="/dashboard/wallet/add-money" className="text-sm font-bold text-lime-300 hover:text-lime-200">Add money →</Link></div>
      {deposits.items.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-white/10 p-6 text-center"><p className="font-bold text-white">No deposits yet</p><p className="mt-2 text-sm text-slate-500">Create a deposit when you are ready to add money.</p></div> : <div className="mt-5 space-y-3">{deposits.items.map((deposit) => <Link key={deposit.id} href={`/dashboard/wallet/deposit/${deposit.id}`} className="flex flex-col gap-3 rounded-xl border border-white/10 p-4 transition hover:border-lime-300/20 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-white">₹{deposit.amount.toFixed(2)} {deposit.currency}</p><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(deposit.status)}`}>{deposit.status}</span></div><p className="mt-2 text-xs text-slate-500">{deposit.reference} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(deposit.createdAt)}</p></div><span className="text-sm font-semibold text-slate-400">View details →</span></Link>)}</div>}
    </section>

    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-white">Transaction history</h2><p className="mt-1 text-sm text-slate-500">{total} recorded ledger transaction{total === 1 ? "" : "s"}.</p></div></div>
      {items.length === 0 ? <div className="mt-8 rounded-xl border border-dashed border-white/10 p-8 text-center"><p className="font-bold text-white">No ledger transactions yet</p><p className="mt-2 text-sm text-slate-500">Pending deposits do not create ledger credits. Financial activity appears here only when a legitimate ledger event is recorded.</p></div> : <div className="mt-5 space-y-3">{items.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-white">{item.category.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{item.description || item.referenceType.replaceAll("_", " ")} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</p></div><div className={`text-right text-sm font-black ${item.type === "CREDIT" ? "text-lime-200" : "text-rose-200"}`}>{item.type === "CREDIT" ? "+" : "−"}₹{item.amount.toFixed(2)} <span className="text-xs font-semibold text-slate-500">{item.currency}</span></div></div>)}</div>}
      {totalPages > 1 ? <nav className="mt-6 flex items-center justify-between border-t border-white/5 pt-5"><Link aria-disabled={page <= 1} className={`text-sm font-semibold ${page <= 1 ? "pointer-events-none text-slate-700" : "text-lime-300"}`} href={`/dashboard/wallet?page=${page - 1}`}>← Previous</Link><span className="text-xs text-slate-500">Page {page} of {totalPages}</span><Link aria-disabled={page >= totalPages} className={`text-sm font-semibold ${page >= totalPages ? "pointer-events-none text-slate-700" : "text-lime-300"}`} href={`/dashboard/wallet?page=${page + 1}`}>Next →</Link></nav> : null}
    </section>
  </SectionContainer>;
}
