"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { CurrentUser } from "@/lib/auth";

function initials(name: string | null) {
  return (name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "U").toUpperCase();
}

export function UserMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" className="flex min-h-10 items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition hover:border-white/10 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-8 rounded-full object-cover" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-lime-300 text-xs font-black text-slate-950">{initials(user.name)}</span>
        )}
        <span className="hidden max-w-32 truncate text-sm font-semibold text-white sm:block">{user.name ?? "Profile"}</span>
        <span className={`text-xs text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-2xl shadow-black/40">
          <div className="border-b border-white/5 px-3 py-2">
            <p className="truncate text-sm font-semibold text-white">{user.name ?? "Player"}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <div className="pt-1">
            <Link role="menuitem" href="/dashboard" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">Dashboard</Link>
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">Profile</Link>
            {user.role === "ADMIN" ? (
              <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">Admin Panel</Link>
            ) : null}
            <div className="mt-1 border-t border-white/5 pt-1">
              <SignOutButton className="w-full justify-start border-transparent bg-transparent px-3 text-left text-slate-300 hover:bg-white/5 hover:text-white" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
