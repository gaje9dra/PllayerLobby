"use client";

export default function TournamentAdminError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-16 text-center sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-300">Tournament management error</p>
      <h1 className="mt-3 text-2xl font-black text-white">We could not load this tournament view.</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">The request could not be completed. Please try again. Database or server details are not shown here.</p>
      <button type="button" onClick={() => reset()} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-lime-300 px-6 text-sm font-bold text-slate-950 hover:bg-lime-200">Try again</button>
    </div>
  );
}
