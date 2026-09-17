"use client";

export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-black text-white">Aviator is temporarily unavailable</h1>
      <button onClick={reset} className="mt-6 rounded-xl bg-lime-300 px-5 py-3 font-bold text-slate-950">Try again</button>
    </main>
  );
}
