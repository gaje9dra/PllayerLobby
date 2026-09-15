import Link from "next/link";
import { SectionContainer } from "@/components/ui/section-container";
import { getAdminWalletDirectory } from "@/lib/admin-finance-tools";
import { createAdjustmentAction } from "@/app/admin/finance/adjustments/actions";

export default async function AdminAdjustmentsPage() {
  const data = await getAdminWalletDirectory({ page: 1 });
  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/admin/finance" className="text-sm font-semibold text-lime-300">← Finance</Link>
    <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Finance controls</p><h1 className="mt-2 text-3xl font-black text-white">Controlled wallet adjustment</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Creates a new immutable-style ADJUSTMENT ledger entry. It never edits or deletes an existing transaction and never directly sets a wallet balance.</p></div>
    <form action={createAdjustmentAction} className="mt-7 max-w-2xl space-y-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.03] p-6">
      <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Wallet<select name="walletId" required className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white"><option value="">Select wallet</option>{data.items.map(w => <option key={w.id} value={w.id}>{w.user.name || "Unnamed"} · {w.user.email} · ₹{w.balance.toFixed(2)}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Direction<select name="direction" required className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white"><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option></select></label><label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Amount<input name="amount" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" placeholder="100.00" /></label></div>
      <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Reason<textarea name="reason" required maxLength={1000} rows={4} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" placeholder="Document the business reason for this correction." /></label>
      <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Idempotency key<input name="idempotencyKey" required maxLength={128} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" placeholder="Unique key for this adjustment request" /></label>
      <div className="rounded-xl border border-amber-300/10 bg-amber-300/[0.03] p-4 text-xs leading-5 text-amber-100/70">Use this only for a documented financial correction. The original ledger record remains unchanged. Reusing the key with different terms is rejected.</div>
      <button className="min-h-11 rounded-xl bg-lime-300 px-5 text-sm font-black text-slate-950">Record adjustment</button>
    </form>
    <p className="mt-5 text-xs text-slate-600">Only the first page of wallets is offered here; use Wallets search to locate a specific wallet before performing a correction.</p>
  </SectionContainer>;
}
