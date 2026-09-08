import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionContainer } from "@/components/ui/section-container";
import { getAdminWalletTransactions } from "@/lib/wallet";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminWalletDetailPage({ params, searchParams }: { params: Promise<{ walletId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { walletId } = await params;
  if (!UUID.test(walletId)) notFound();
  const query = await searchParams;
  const page = Number(query.page ?? "1");
  if (!Number.isSafeInteger(page) || page < 1) notFound();
  const { wallet, items, total, totalPages, reconciliation } = await getAdminWalletTransactions(walletId, page);
  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/admin/finance/wallets" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Wallets</Link>
    <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Wallet ledger</p><h1 className="mt-2 text-3xl font-black text-white">{wallet.user.name || "Unnamed"}</h1><p className="mt-1 text-sm text-slate-500">{wallet.user.email} · {wallet.user.status}</p></div>
    <section className="mt-7 grid gap-4 sm:grid-cols-4"><Metric label="Balance" value={`₹${wallet.balance.toFixed(2)}`} /><Metric label="Currency" value={wallet.currency} /><Metric label="Calculated" value={`₹${reconciliation.expectedBalance}`} /><Metric label="Reconciliation" value={reconciliation.status} /></section>
    <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-white">Ledger history</h2><p className="mt-1 text-sm text-slate-500">{total} immutable-style record{total === 1 ? "" : "s"}. Read-only.</p></div><span className="text-xs text-slate-600">Difference: {reconciliation.difference}</span></div>{items.length === 0 ? <p className="mt-7 text-sm text-slate-500">No ledger entries.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Direction</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Description</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-white/5"><td className="px-3 py-4 text-slate-400">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</td><td className={`px-3 py-4 font-bold ${item.type === "CREDIT" ? "text-lime-200" : "text-rose-200"}`}>{item.type}</td><td className="px-3 py-4 text-slate-300">{item.category.replaceAll("_", " ")}</td><td className="px-3 py-4 font-bold text-white">₹{item.amount.toFixed(2)} {item.currency}</td><td className="px-3 py-4 font-mono text-xs text-slate-500">{item.referenceType}</td><td className="px-3 py-4 text-slate-400">{item.description || "—"}</td></tr>)}</tbody></table></div>}{totalPages > 1 ? <nav className="mt-6 flex items-center justify-between border-t border-white/5 pt-5"><Link className={page <= 1 ? "pointer-events-none text-slate-700" : "text-lime-300"} href={`/admin/finance/wallets/${walletId}?page=${page - 1}`}>← Previous</Link><span className="text-xs text-slate-500">Page {page} of {totalPages}</span><Link className={page >= totalPages ? "pointer-events-none text-slate-700" : "text-lime-300"} href={`/admin/finance/wallets/${walletId}?page=${page + 1}`}>Next →</Link></nav> : null}</section>
  </SectionContainer>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{label}</p><p className="mt-2 text-xl font-black text-white">{value}</p></div>; }
