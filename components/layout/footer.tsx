import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <p className="font-bold text-white">{siteConfig.name}</p>
          <p className="mt-1 text-sm text-slate-500">© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
        </div>
        <div className="flex gap-5 text-sm text-slate-400">
          <Link href="/" className="hover:text-white">Home</Link>
          <Link href="/tournaments" className="hover:text-white">Tournaments</Link>
        </div>
      </div>
    </footer>
  );
}
