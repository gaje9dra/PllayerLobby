import Link from "next/link";
import { SectionContainer } from "@/components/ui/section-container";

export default function AccessDeniedPage() {
  return (
    <SectionContainer className="flex min-h-[calc(100vh-9rem)] items-center justify-center py-14 sm:py-20">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.035] p-7 text-center shadow-2xl shadow-black/20 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Access restricted</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
          You do not have permission to access this page.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-400">
          Your account does not currently have access to this area. Please return to a permitted page and continue from there.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-lime-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-lime-200"
          >
            Back to home
          </Link>
          <Link
            href="/tournaments"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-bold text-white transition hover:bg-white/5"
          >
            Browse tournaments
          </Link>
        </div>
      </section>
    </SectionContainer>
  );
}
