"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function SignOutButton({ className = "" }: { className?: string }) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignOut() {
    if (isLoading) return;

    setIsLoading(true);
    await signOut({ callbackUrl: "/" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isLoading}
      className={`inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-60 ${className}`}
    >
      {isLoading ? "Signing out…" : "Logout"}
    </button>
  );
}
