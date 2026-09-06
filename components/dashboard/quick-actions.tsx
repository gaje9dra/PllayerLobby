import Link from "next/link";

const actions = [
  { title: "Browse Tournaments", description: "Find upcoming competitions and explore available events.", href: "/tournaments", label: "Explore tournaments" },
  { title: "My Tournaments", description: "Your registered tournaments will appear here in a future phase.", href: "#my-tournaments", label: "View section" },
] as const;

export function QuickActions() {
  return (
    <section aria-labelledby="quick-actions-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Shortcuts</p>
          <h2 id="quick-actions-title" className="mt-2 text-xl font-black text-white">Quick actions</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {actions.map((action) => (
          <Link key={action.title} href={action.href} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-lime-300/30 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-white">{action.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{action.description}</p>
              </div>
              <span className="text-lime-300 transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{action.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
