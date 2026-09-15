import Link from "next/link";
import { SectionContainer } from "@/components/ui/section-container";
import { getAdminFinanceOverview } from "@/lib/admin-finance";

function money(value: string) { return `₹${value}`; }
function label(value: string) { return value.replaceAll("_", " "); }
function date(value: Date) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(value); }

export default async function AdminFinancePage() {
  const data = await getAdminFinanceOverview();
  const cards = [
    ["Wallet users", data.walletUsers.toLocaleString("en-IN"), "Users with wallets"],
    ["Total wallet balance", money(data.totalWalletBalance), "Stored wallet liabilities"],
    ["Successful deposits", money(data.successfulDeposits), `${data.successfulDepositCount} successful deposits`],
    ["Tournament entries", money(data.tournamentEntryDebits), `${data.tournamentEntryCount} wallet debits`],
    ["Prize winnings", money(data.prizeWinnings), `${data.prizeWinningCount} wallet credits`],
    ["Pending payments", data.pendingPayments.toLocaleString("en-IN"), "Provider payments requiring attention"],
    ["Failed payments", data.failedPayments.toLocaleString("en-IN"), "Failed/cancelled provider payments"],
    ["Reconciliation issues", data.reconciliationIssues.toLocaleString("en-IN"), "Wallet balance vs ledger mismatch"],
    ["Unresolved cases", data.unresolvedCases.toLocaleString("en-IN"), "Pending deposits + settlements + mismatches"],
  ];
  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/admin" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Admin</Link>
    <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Finance</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Financial management</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Authoritative server-side financial overview. Wallet balances and ledger records remain read-only from the admin interface.</p></div><div className="flex flex-wrap gap-2"><Link href="/admin/finance/wallets" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white">Wallets</Link><Link href="/admin/finance/transactions" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white">Transactions</Link><Link href="/admin/finance/deposits" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white">Deposits</Link><Link href="/admin/finance/audit" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white">Audit</Link><Link href="/admin/finance/adjustments" className="rounded-xl border border-amber-300/20 px-4 py-2 text-sm font-bold text-amber-100">Adjustments</Link></div></div>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([title, value, hint]) => <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p><p className="mt-3 text-2xl font-black text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></article>)}</section>
    <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"><div className="flex flex-col gap-2 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-white">Recent ledger activity</h2><p className="mt-1 text-xs text-slate-500">Latest immutable-style wallet transactions.</p></div><Link href="/admin/finance/transactions" className="text-sm font-semibold text-lime-300">View full ledger →</Link></div>{data.recentTransactions.length === 0 ? <p className="p-8 text-sm text-slate-500">No wallet transactions recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Created</th></tr></thead><tbody>{data.recentTransactions.map(item => <tr key={item.id} className="border-t border-white/5"><td className="px-5 py-4"><p className="font-semibold text-white">{item.wallet.user.name || "Unnamed"}</p><p className="text-xs text-slate-500">{item.wallet.user.email}</p></td><td className="px-5 py-4"><span className={item.type === "CREDIT" ? "text-lime-200" : "text-rose-200"}>{item.type}</span></td><td className="px-5 py-4 text-slate-300">{label(item.category)}</td><td className="px-5 py-4 font-bold text-white">₹{item.amount.toFixed(2)} {item.currency}</td><td className="px-5 py-4 break-all font-mono text-xs text-slate-500">{item.referenceType}:{item.referenceId}</td><td className="px-5 py-4 whitespace-nowrap text-xs text-slate-400">{date(item.createdAt)}</td></tr>)}</tbody></table></div>}</section>
  </SectionContainer>;
}
