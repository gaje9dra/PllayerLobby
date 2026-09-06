import { requireAdmin } from "@/lib/auth";
import { SectionContainer } from "@/components/ui/section-container";

export default async function AdminPage() {
  const user = await requireAdmin();

  return (
    <SectionContainer className="py-14 sm:py-20">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">
        Administration
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
        Admin foundation
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        You are authenticated as an administrator. Management features will be
        introduced in later phases.
      </p>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Current account
        </p>
        <p className="mt-3 font-semibold text-white">{user.email}</p>
        <p className="mt-1 text-sm text-slate-500">
          Role: {user.role} · Status: {user.status}
        </p>
      </div>
    </SectionContainer>
  );
}
