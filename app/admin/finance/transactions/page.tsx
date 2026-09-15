import Link from "next/link";
import { WalletTransactionCategory, WalletTransactionType } from "@/app/generated/prisma/client";
import { SectionContainer } from "@/components/ui/section-container";
import { getAdminTransactions } from "@/lib/admin-finance-tools";

function label(v: string) { return v.replaceAll("_", " "); }
function date(v: Date) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(v); }

export default async function AdminTransactionsPage({ searchParams }: { searchParams: Promise<{ page?: string; query?: string; type?: string; category?: string }> }) {
  const p = await searchParams;
  const page = Number(p.page ?? "1");
  const type = Object.values(WalletTransactionType).includes(p.type as WalletTransactionType) ? p.type : undefined;
  const category = Object.values(WalletTransactionCategory).includes(p.category as WalletTransactionCategory) ? p.category : undefined;
  const data = await getAdminTransactions({ page, query: p.query, type, category });
  const href = (next: number) => `/admin/finance/transactions?${new URLSearchParams({ ...(p.query ? { query: p.query } : {}), ...(type ? { type } : {}), ...(category ? { category } : {}), page: String(next) })}`;
  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/admin/finance" className="text-sm font-semibold text-lime-300">← Finance</Link>
    <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Finance</p><h1 className="mt-2 text-3xl font-black text-white">Wallet transactions</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Server-side searchable ledger inspection. Ledger records are immutable from this interface.</p></div>
    <form method="get" className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2 lg:grid-cols-4">
      <input name="query" defaultValue={p.query ?? ""} placeholder="User, email, transaction/reference ID" className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none" />
      <select name="type" defaultValue={type ?? ""} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white"><option value="">All directions</option>{Object.values(WalletTransactionType).map(v => <option key={v} value={v}>{label(v)}</option>)}</select>
      <select name="category" defaultValue={category ?? ""} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white"><option value="">All categories</option>{Object.values(WalletTransactionCategory).map(v => <option key={v} value={v}>{label(v)}</option>)}</select>
      <button className="min-h-11 rounded-xl bg-lime-300 px-4 text-sm font-bold text-slate-950">Search ledger</button>
    </form>
    <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"><div className="border-b border-white/5 px-5 py-4 text-sm text-slate-400">{data.total} transaction{data.total === 1 ? "" : "s"} · page {data.page} of {data.totalPages}</div>{data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No transactions match the filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Direction</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Description</th></tr></thead><tbody>{data.items.map(x => <tr key={x.id} className="border-t border-white/5"><td className="px-5 py-4 whitespace-nowrap text-xs text-slate-400">{date(x.createdAt)}</td><td className="px-5 py-4"><p className="font-semibold text-white">{x.wallet.user.name || "Unnamed"}</p><p className="text-xs text-slate-500">{x.wallet.user.email}</p></td><td className={`px-5 py-4 font-bold ${x.type === "CREDIT" ? "text-lime-200" : "text-rose-200"}`}>{x.type}</td><td className="px-5 py-4 text-slate-300">{label(x.category)}</td><td className="px-5 py-4 font-bold text-white">₹{x.amount.toFixed(2)} {x.currency}</td><td className="px-5 py-4 font-mono text-xs text-slate-500">{x.referenceType}:{x.referenceId}</td><td className="px-5 py-4 text-slate-400">{x.description || "—"}</td></tr>)}</tbody></table></div>}{data.totalPages > 1 ? <nav className="flex items-center justify-between border-t border-white/5 px-5 py-4"><Link href={href(Math.max(1, data.page - 1))} className={data.page <= 1 ? "pointer-events-none text-slate-700" : "text-sm font-semibold text-lime-300"}>← Previous</Link><span className="text-xs text-slate-500">Page {data.page} of {data.totalPages}</span><Link href={href(Math.min(data.totalPages, data.page + 1))} className={data.page >= data.totalPages ? "pointer-events-none text-slate-700" : "text-sm font-semibold text-lime-300"}>Next →</Link></nav> : null}</section>
  </SectionContainer>;
}
