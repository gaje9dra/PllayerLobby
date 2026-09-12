import { requireAdmin } from "@/lib/auth";
import { SectionContainer } from "@/components/ui/section-container";
import { Button } from "@/components/ui/button";

export default async function AdminPage() {
  const user = await requireAdmin();

  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Administration</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Admin Panel</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Manage tournament configuration, financial reconciliation, and your organizer account.</p>
        </div>
        <Button href="/admin/tournaments">Manage Tournaments</Button>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Current account</p>
          <p className="mt-3 font-semibold text-white">{user.email}</p>
          <p className="mt-1 text-sm text-slate-500">Role: {user.role} · Status: {user.status}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tournament management</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Create tournament drafts using the secure server-side admin workflow.</p>
          <Button href="/admin/tournaments/create" variant="secondary" className="mt-5">Create Tournament</Button>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Finance</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Inspect wallets, reconcile the ledger, review deposits, and review withdrawal requests.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Button href="/admin/finance/wallets" variant="secondary">Wallet Reconciliation</Button><Button href="/admin/finance/deposits" variant="secondary">Deposits</Button><Button href="/admin/finance/withdrawals" variant="secondary">Withdrawals</Button></div>
        </div>
      </div>
    </SectionContainer>
  );
}
