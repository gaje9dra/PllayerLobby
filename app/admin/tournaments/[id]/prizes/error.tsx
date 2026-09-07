"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-3xl px-6 py-16 text-center"><h1 className="text-2xl font-black text-white">Unable to load prize configuration</h1><p className="mt-2 text-sm text-slate-400">Please try again.</p><button onClick={() => reset()} className="mt-6 rounded-xl bg-lime-300 px-5 py-3 font-semibold text-slate-950">Retry</button></div>;
}
