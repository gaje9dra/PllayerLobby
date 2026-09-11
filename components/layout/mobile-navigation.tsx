"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function MobileNavigation({ user }: { user: CurrentUser | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="border-t border-white/5 md:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-end px-4 py-2 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Close mobile navigation" : "Open mobile navigation"}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
        >
          <span>{open ? "Close" : "Menu"}</span>
          <span aria-hidden="true">{open ? "×" : "☰"}</span>
        </button>
      </div>
      {open ? (
        <nav
          id="mobile-navigation"
          className="border-t border-white/5 px-4 py-3"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto grid max-w-7xl gap-1">
            <Link
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
              href="/"
            >
              Home
            </Link>
            <Link
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
              href="/tournaments"
            >
              Tournaments
            </Link>
            {user ? (
              <Link
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
                href="/dashboard"
              >
                Dashboard
              </Link>
            ) : null}
            {user ? (
              <Link
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
                href="/profile"
              >
                Profile
              </Link>
            ) : null}
            {user && user.role === "ADMIN" ? (
              <Link
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
                href="/admin"
              >
                Admin Panel
              </Link>
            ) : null}
            {user ? (
              <div className="mt-1 border-t border-white/5 pt-2">
                <SignOutButton className="w-full" />
              </div>
            ) : (
              <Link
                onClick={() => setOpen(false)}
                className="mt-1 rounded-xl bg-lime-300 px-3 py-3 text-center text-sm font-bold text-slate-950"
                href="/login"
              >
                Login with Google
              </Link>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
