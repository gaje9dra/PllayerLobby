"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function WalletBalanceBadge({ initialBalance }: { initialBalance: string }) {
  const [balance, setBalance] = useState(initialBalance);

  const refreshBalance = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet/balance", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) return;
      if (!response.ok) return;
      const data = (await response.json()) as { balance?: string };
      if (typeof data.balance === "string") setBalance(data.balance);
    } catch {
      // Keep the last confirmed balance during temporary network failures.
    }
  }, []);

  useEffect(() => {
    const onWalletUpdated = () => void refreshBalance();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshBalance();
    };

    void refreshBalance();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshBalance();
    }, 5000);

    window.addEventListener("playerlobby:wallet-updated", onWalletUpdated);
    window.addEventListener("focus", onWalletUpdated);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("playerlobby:wallet-updated", onWalletUpdated);
      window.removeEventListener("focus", onWalletUpdated);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshBalance]);

  const formatted = Number(balance).toFixed(2).replace(/\\.00$/, "");
  return (
    <Link
      href="/dashboard/wallet"
      aria-label={`Wallet balance ₹${formatted}`}
      className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-bold tracking-tight text-slate-200 shadow-sm transition hover:border-lime-300/30 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 sm:min-h-10 sm:px-3.5 sm:text-sm"
    >
      Wallet ₹{formatted}
    </Link>
  );
}
