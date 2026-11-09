import Link from "next/link";
import { SectionContainer } from "@/components/ui/section-container";
import { getAdminWalletDirectory } from "@/lib/admin-finance-tools";
import { adjustUserWalletAction, changeUserStatusAction, freezeUserWalletAction, unfreezeUserWalletAction } from "./actions";

export default async function AdminUserControlsPage({ searchParams }: { searchParams: Promise<{ query?: string; status?: string; updated?: string }> }) {
  const params = await searchParams;
  const data = await getAdminWalletDirectory({ page: 1, query: params.query, status: params.status });
  const notices: Record<string, string> = {
    wallet: "Wallet adjustment recorded in the ledger.",
    frozen: "Wallet frozen. All wallet credits and debits are now blocked.",
    unfrozen: "Wallet unfrozen. Wallet transactions are enabled again.",
    status: "User account status updated.",
  };

  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/admin" className="text-sm font-semibold text-lime-300">← Admin</Link>
    <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Platform administration</p><h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">User & wallet controls</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Manage wallet balances through audited ledger entries, freeze wallet transactions, or suspend and block user accounts. Every action requires a reason.</p></div>
    {params.updated && notices[params.updated] ? <p role="status" className="mt-5 rounded-xl border border-lime-300/20 bg-lime-300/[0.06] p-3 text-sm text-lime-100">{notices[params.updated]}</p> : null}
    <form method="get" className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-[1fr_180px_auto]">
      <input name="query" defaultValue={params.query ?? ""} placeholder="Search by user ID, name, email or phone" className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none" />
      <select name="status" defaultValue={params.status ?? ""} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white"><option value="">All account statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="BANNED">Banned</option></select>
      <button className="min-h-11 rounded-xl bg-lime-300 px-5 text-sm font-bold text-slate-950">Search users</button>
    </form>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{data.total} matching wallets · showing page {data.page} of {data.totalPages}</span><Link href="/admin/finance/adjustments" className="font-semibold text-lime-300">Open legacy adjustments →</Link></div>
    <div className="mt-4 space-y-4">
      {data.items.map((wallet) => <section key={wallet.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-lg font-black text-white">{wallet.user.name || "Unnamed user"}</h2><p className="mt-1 text-sm text-slate-400">{wallet.user.email}</p><p className="mt-1 font-mono text-[10px] text-slate-600">User ID: {wallet.userId}</p></div>
          <div className="text-right"><p className="text-2xl font-black text-white">₹{wallet.balance.toFixed(2)}</p><p className="mt-1 text-xs text-slate-500">{wallet.currency} · {wallet.user.status}</p><p className={`mt-1 text-xs font-bold ${wallet.isFrozen ? "text-rose-300" : "text-emerald-300"}`}>{wallet.isFrozen ? "WALLET FROZEN" : "WALLET ACTIVE"}</p></div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <form action={adjustUserWalletAction} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <input type="hidden" name="walletId" value={wallet.id} />
            <h3 className="text-sm font-bold text-white">Credit / debit wallet</h3>
            <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold uppercase text-slate-500">Direction<select name="direction" className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm text-white"><option value="CREDIT">Add money</option><option value="DEBIT">Deduct money</option></select></label><label className="text-[10px] font-bold uppercase text-slate-500">Amount (₹)<input name="amount" required inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" placeholder="100.00" className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm text-white" /></label></div>
            <label className="block text-[10px] font-bold uppercase text-slate-500">Reason<textarea name="reason" required maxLength={1000} rows={2} placeholder="Required audit reason" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-sm text-white" /></label>
            <label className="block text-[10px] font-bold uppercase text-slate-500">Unique reference<input name="idempotencyKey" required maxLength={128} placeholder="e.g. manual-credit-2026-001" className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm text-white" /></label>
            <button className="min-h-10 w-full rounded-lg bg-lime-300 px-4 text-sm font-black text-slate-950">Record wallet adjustment</button>
            {wallet.isFrozen ? <p className="text-xs text-rose-300">Unfreeze this wallet before making an adjustment.</p> : null}
          </form>
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-bold text-white">Wallet transaction lock</h3>
            <p className="text-xs leading-5 text-slate-500">Freezing blocks every wallet credit and debit, including deposits, withdrawals and game transactions. Existing balance is preserved.</p>
            {wallet.isFrozen ? <><p className="text-xs text-rose-200">Reason: {wallet.frozenReason || "Not provided"}</p><form action={unfreezeUserWalletAction} className="space-y-2"><input type="hidden" name="walletId" value={wallet.id} /><input name="reason" required maxLength={1000} placeholder="Reason for unfreezing" className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm text-white" /><button className="min-h-10 w-full rounded-lg border border-emerald-300/30 px-4 text-sm font-bold text-emerald-200">Unfreeze wallet</button></form></> : <form action={freezeUserWalletAction} className="space-y-2"><input type="hidden" name="walletId" value={wallet.id} /><input name="reason" required maxLength={1000} placeholder="Reason for freezing" className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm text-white" /><button className="min-h-10 w-full rounded-lg border border-rose-300/30 px-4 text-sm font-bold text-rose-200">Freeze wallet</button></form>}
          </div>
          <form action={changeUserStatusAction} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <input type="hidden" name="userId" value={wallet.userId} />
            <h3 className="text-sm font-bold text-white">Account access</h3>
            <p className="text-xs leading-5 text-slate-500">Suspended users cannot access protected features. Banned users are blocked from account access. Admin accounts cannot be changed here.</p>
            <label className="block text-[10px] font-bold uppercase text-slate-500">New status<select name="status" defaultValue={wallet.user.status} className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm text-white"><option value="ACTIVE">Active / unblock</option><option value="SUSPENDED">Suspended</option><option value="BANNED">Banned / block</option></select></label>
            <label className="block text-[10px] font-bold uppercase text-slate-500">Reason<textarea name="reason" required maxLength={1000} rows={2} placeholder="Required audit reason" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-sm text-white" /></label>
            <button className="min-h-10 w-full rounded-lg border border-amber-300/30 px-4 text-sm font-bold text-amber-100">Update account status</button>
          </form>
        </div>
        <div className="mt-4 flex justify-end"><Link href={`/admin/finance/wallets/${wallet.id}`} className="text-xs font-semibold text-lime-300">View full wallet ledger →</Link></div>
      </section>)}
      {data.items.length === 0 ? <div className="rounded-2xl border border-white/10 p-10 text-center text-sm text-slate-500">No wallets match this search.</div> : null}
    </div>
    {data.totalPages > 1 ? <p className="mt-5 text-xs text-slate-500">This control view shows the first result page. Narrow the search to locate a specific user.</p> : null}
  </SectionContainer>;
}
