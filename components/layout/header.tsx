import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNavigation } from "@/components/layout/mobile-navigation";

export async function Header() {
  const user = await getCurrentUser();

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

        {user ? <UserMenu user={user} /> : <Button href="/login" variant="secondary" className="min-h-10 px-4">Login with Google</Button>}
      </div>

      <MobileNavigation user={user} />
    </header>
  );
}
