import Link from "next/link";
import { WalletDepositStatus } from "@/app/generated/prisma/client";
import { SectionContainer } from "@/components/ui/section-container";
import { getAdminDeposits } from "@/lib/wallet-deposit";

const statuses = Object.values(WalletDepositStatus);
function parseStatus(value: string | undefined) { return value && statuses.includes(value as WalletDepositStatus) ? value as WalletDepositStatus : undefined; }
function label(value: string) { return value.replaceAll("_", " "); }
function date(value: Date) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(value); }

export default async function AdminDepositsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string; reference?: string; minAmount?: string; maxAmount?: string }> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const status = parseStatus(params.status);
  const minAmount = params.minAmount?.trim() || undefined;
  const maxAmount = params.maxAmount?.trim() || undefined;
  const data = await getAdminDeposits({ page, status, reference: params.reference, minAmount, maxAmount });
  const query = (nextPage: number) => new URLSearchParams({ ...(status ? { status } : {}), ...(params.reference ? { reference: params.reference } : {}), ...(minAmount ? { minAmount } : {}), ...(maxAmount ? { maxAmount } : {}), page: String(nextPage) }).toString();

  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/admin" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Admin</Link>
    <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Finance</p><h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Wallet deposits</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Read-only deposit visibility for reconciliation preparation. There is no manual success, balance-edit, or payment bypass action.</p></div><div className="flex flex-wrap gap-2">{[undefined, ...statuses].map((value) => <Link key={value ?? "ALL"} href={value ? `/admin/finance/deposits?status=${value}` : "/admin/finance/deposits"} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${status === value || (!status && !value) ? "border-lime-300/30 bg-lime-300/10 text-lime-200" : "border-white/10 text-slate-400 hover:text-white"}`}>{value ? label(value) : "All"}</Link>)}</div></div>

    <form className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
      {status ? <input type="hidden" name="status" value={status} /> : null}
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Reference<input name="reference" defaultValue={params.reference ?? ""} placeholder="DEP-..." className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/20" /></label>
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Min amount<input name="minAmount" defaultValue={minAmount ?? ""} inputMode="decimal" placeholder="100" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/20" /></label>
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Max amount<input name="maxAmount" defaultValue={maxAmount ?? ""} inputMode="decimal" placeholder="5000" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/20" /></label>
      <div className="flex items-end"><button type="submit" className="min-h-11 w-full rounded-xl bg-lime-300 px-4 text-sm font-bold text-slate-950 hover:bg-lime-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300">Filter deposits</button></div>
    </form>

    <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"><div className="border-b border-white/5 px-5 py-4 text-sm text-slate-400">{data.total} deposit{data.total === 1 ? "" : "s"} · page {data.page} of {data.totalPages}</div>{data.items.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No deposits match this filter.</div> : <div className="divide-y divide-white/5">{data.items.map((item) => <div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.8fr)_minmax(180px,0.7fr)] lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-white">₹{item.amount.toFixed(2)} {item.currency}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-slate-400">{label(item.status)}</span></div><p className="mt-2 text-sm text-slate-300">{item.user.name || "Unnamed player"} · {item.user.email}</p><p className="mt-2 break-all font-mono text-xs text-slate-500">{item.reference}</p>{item.providerReference ? <p className="mt-1 break-all text-xs text-slate-500">Provider reference: {item.providerReference}</p> : null}</div><div className="rounded-xl border border-white/5 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Wallet</p><p className="mt-1 text-sm font-bold text-white">₹{item.wallet.balance.toFixed(2)} {item.wallet.currency}</p><p className="mt-1 text-xs text-slate-500">User status: {label(item.user.status)}</p></div><div><p className="text-xs text-slate-500">Created</p><p className="mt-1 text-sm text-slate-300">{date(item.createdAt)}</p><p className="mt-3 text-xs text-slate-500">Updated</p><p className="mt-1 text-sm text-slate-300">{date(item.updatedAt)}</p></div></div>)}</div>}{data.totalPages > 1 ? <nav className="flex items-center justify-between border-t border-white/5 px-5 py-4"><Link className={data.page <= 1 ? "pointer-events-none text-slate-700" : "text-sm font-semibold text-lime-300"} href={`/admin/finance/deposits?${query(data.page - 1)}`}>← Previous</Link><span className="text-xs text-slate-500">Page {data.page} of {data.totalPages}</span><Link className={data.page >= data.totalPages ? "pointer-events-none text-slate-700" : "text-sm font-semibold text-lime-300"} href={`/admin/finance/deposits?${query(data.page + 1)}`}>Next →</Link></nav> : null}</section>
  </SectionContainer>;
}
