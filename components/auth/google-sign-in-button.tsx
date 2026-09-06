"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function GoogleSignInButton({ callbackUrl = "/dashboard", disabled = false }: { callbackUrl?: string; disabled?: boolean }) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignIn() {
    if (isLoading || disabled) return;

    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading || disabled}
      className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white text-sm font-bold text-slate-950 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 disabled:pointer-events-none disabled:opacity-60"
    >
      <span className="grid size-6 place-items-center rounded-full bg-white text-sm font-black" aria-hidden="true">
        G
      </span>
      {disabled ? "Google sign-in unavailable" : isLoading ? "Connecting to Google…" : "Continue with Google"}
    </button>
  );
}
