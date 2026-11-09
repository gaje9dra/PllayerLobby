"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AdminShellProps = {
  children: ReactNode;
  adminEmail: string;
  adminRole: string;
};

const groups = [
  {
    label: "Workspace",
    items: [{ label: "Overview", href: "/admin", icon: "▦" }],
  },
  {
    label: "Platform",
    items: [
      { label: "Games", href: "/admin/games", icon: "◈" },
      { label: "Tournaments", href: "/admin/tournaments", icon: "♜" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Finance overview", href: "/admin/finance", icon: "₹" },
      { label: "Withdrawals", href: "/admin/finance/withdrawals", icon: "↗" },
      { label: "Deposits", href: "/admin/finance/deposits", icon: "↙" },
      { label: "Wallets", href: "/admin/finance/wallets", icon: "▣" },
      { label: "Transactions", href: "/admin/finance/transactions", icon: "≋" },
      { label: "Audit & reconciliation", href: "/admin/finance/audit", icon: "⌕" },
      { label: "Adjustments", href: "/admin/finance/adjustments", icon: "±" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children, adminEmail, adminRole }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 lg:grid lg:grid-cols-[258px_minmax(0,1fr)]">
      <aside className="border-b border-white/[0.08] bg-[#0b111b] lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.07] px-5">
          <div className="grid size-10 place-items-center rounded-xl bg-lime-300 text-lg font-black text-slate-950">P</div>
          <div>
            <p className="text-sm font-extrabold tracking-wide text-white">PLAYERLOBBY</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Control center</p>
          </div>
        </div>

        <nav aria-label="Admin navigation" className="flex gap-5 overflow-x-auto px-3 py-4 lg:block lg:space-y-6 lg:overflow-visible">
          {groups.map((group) => (
            <div key={group.label} className="min-w-max lg:min-w-0">
              <p className="hidden px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 lg:block">{group.label}</p>
              <div className="flex gap-1 lg:block lg:space-y-1">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-lime-300 text-slate-950 shadow-[0_8px_24px_rgba(190,242,100,0.12)]" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"}`}
                    >
                      <span className={`grid size-6 shrink-0 place-items-center text-base ${active ? "text-slate-950" : "text-slate-500 group-hover:text-lime-200"}`} aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                      {item.href === "/admin/finance/withdrawals" && <span className={`ml-auto hidden size-1.5 rounded-full lg:block ${active ? "bg-slate-950" : "bg-amber-300"}`} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-white/[0.07] p-4 lg:block">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
              <span className="text-[11px] font-semibold text-slate-400">Admin session active</span>
            </div>
            <p className="mt-3 truncate text-xs font-semibold text-white" title={adminEmail}>{adminEmail}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{adminRole.replaceAll("_", " ")}</p>
          </div>
          <Link href="/" className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white/[0.05] hover:text-white">
            <span aria-hidden="true">↗</span> View public platform
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-white/[0.07] bg-[#070b12]/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lime-300">Administration</p>
            <p className="mt-1 text-sm font-semibold text-white">Platform operations</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 sm:inline-flex">● Secure session</span>
            <div className="grid size-9 place-items-center rounded-full border border-lime-200/20 bg-lime-200/10 text-xs font-black text-lime-200">{adminEmail.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <main className="min-w-0 px-4 py-7 sm:px-7 sm:py-9 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
