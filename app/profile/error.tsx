"use client";

export default function ProfileError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-4 py-16 text-center sm:px-6">
      <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-300">Something went wrong</p>
        <h1 className="mt-3 text-2xl font-black text-white">We couldn’t load your profile.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">Please try again. Your account and authentication data have not been changed.</p>
        <button type="button" onClick={() => reset()} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-lime-300 px-5 text-sm font-semibold text-slate-950 hover:bg-lime-200">Try again</button>
      </div>
    </main>
  );
}
