"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-3xl px-6 py-16"><div className="rounded-2xl border border-rose-300/20 bg-rose-300/5 p-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-200">Finance error</p><h1 className="mt-2 text-2xl font-black text-white">Unable to load wallet reconciliation</h1><p className="mt-3 text-sm text-slate-400">The financial records could not be loaded. No balance was changed by this page.</p><button onClick={() => reset()} className="mt-6 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-black">Try again</button></div></main>;
}
