import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionContainer } from "@/components/ui/section-container";
import { getCurrentUserWalletTransactions } from "@/lib/wallet";

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  if (!Number.isSafeInteger(page) || page < 1) notFound();
  const { wallet, items, total, totalPages } = await getCurrentUserWalletTransactions(page);
  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/dashboard" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Dashboard</Link>
    <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Wallet</p><h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Your wallet</h1><p className="mt-2 text-sm text-slate-400">Your financial balance is calculated from server-side wallet records.</p></div>
      <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 px-6 py-4 text-right"><p className="text-xs font-bold uppercase tracking-wide text-lime-200">Available balance</p><p className="mt-1 text-3xl font-black text-white">₹{wallet.balance.toFixed(2)}</p><p className="text-xs font-semibold text-slate-400">{wallet.currency}</p></div>
    </div>
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-white">Transaction history</h2><p className="mt-1 text-sm text-slate-500">{total} recorded transaction{total === 1 ? "" : "s"}.</p></div></div>
      {items.length === 0 ? <div className="mt-8 rounded-xl border border-dashed border-white/10 p-8 text-center"><p className="font-bold text-white">No transactions yet</p><p className="mt-2 text-sm text-slate-500">Your wallet balance is ₹0.00 and financial activity will appear here when a legitimate ledger event is recorded.</p></div> : <div className="mt-5 space-y-3">{items.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-white">{item.category.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{item.description || item.referenceType.replaceAll("_", " ")} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</p></div><div className={`text-right text-sm font-black ${item.type === "CREDIT" ? "text-lime-200" : "text-rose-200"}`}>{item.type === "CREDIT" ? "+" : "−"}₹{item.amount.toFixed(2)} <span className="text-xs font-semibold text-slate-500">{item.currency}</span></div></div>)}</div>}
      {totalPages > 1 ? <nav className="mt-6 flex items-center justify-between border-t border-white/5 pt-5"><Link aria-disabled={page <= 1} className={`text-sm font-semibold ${page <= 1 ? "pointer-events-none text-slate-700" : "text-lime-300"}`} href={`/dashboard/wallet?page=${page - 1}`}>← Previous</Link><span className="text-xs text-slate-500">Page {page} of {totalPages}</span><Link aria-disabled={page >= totalPages} className={`text-sm font-semibold ${page >= totalPages ? "pointer-events-none text-slate-700" : "text-lime-300"}`} href={`/dashboard/wallet?page=${page + 1}`}>Next →</Link></nav> : null}
    </section>
  </SectionContainer>;
}
