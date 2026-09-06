import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-6 text-center sm:p-8">
      <div className="mx-auto grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-slate-500" aria-hidden="true">—</div>
      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
