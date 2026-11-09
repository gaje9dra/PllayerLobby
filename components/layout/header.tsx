import Link from "next/link";
import { getCurrentUser, isActiveUser, isAdmin } from "@/lib/auth";
import { getOrCreateWalletForUser } from "@/lib/wallet";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNavigation } from "@/components/layout/mobile-navigation";

export async function Header() {
  const user = await getCurrentUser();
  const wallet = user && isActiveUser(user) ? await getOrCreateWalletForUser(user.id) : null;
  const walletBalance = wallet ? wallet.balance.toFixed(2).replace(/\.00$/, "") : null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label={`${siteConfig.name} home`}>
          <span className="grid size-9 place-items-center rounded-lg bg-lime-300 font-black text-slate-950">A</span>
          <span className="hidden text-base font-black tracking-tight text-white sm:block">{siteConfig.name}</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
          <Link className="text-sm font-medium text-slate-300 transition hover:text-white" href="/">Home</Link>
          <Link className="text-sm font-medium text-slate-300 transition hover:text-white" href="/tournaments">Tournaments</Link>
          <Link className="text-sm font-medium text-slate-300 transition hover:text-white" href="/games/aviator">Games</Link>
          {user ? <Link className="text-sm font-medium text-slate-300 transition hover:text-white" href="/dashboard">Dashboard</Link> : null}
          {user && isAdmin(user) ? <Link className="text-sm font-medium text-slate-300 transition hover:text-white" href="/admin">Admin Panel</Link> : null}
        </nav>

        {user ? (
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {walletBalance !== null ? (
              <Link
                href="/dashboard/wallet"
                aria-label={`Wallet balance ₹${walletBalance}`}
                className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-bold tracking-tight text-slate-200 shadow-sm transition hover:border-lime-300/30 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 sm:min-h-10 sm:px-3.5 sm:text-sm"
              >
                Wallet ₹{walletBalance}
              </Link>
            ) : null}
            <UserMenu user={user} />
          </div>
        ) : <Button href="/login" variant="secondary" className="min-h-10 px-4">Login with Google</Button>}
      </div>

      <MobileNavigation user={user} />
    </header>
  );
}
