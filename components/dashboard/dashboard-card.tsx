import type { ReactNode } from "react";

export function DashboardCard({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-7" aria-labelledby={`${title.toLowerCase().replace(/\s+/g, "-")}-title`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">{eyebrow}</p>
      <h2 id={`${title.toLowerCase().replace(/\s+/g, "-")}-title`} className="mt-2 text-xl font-black text-white">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}
