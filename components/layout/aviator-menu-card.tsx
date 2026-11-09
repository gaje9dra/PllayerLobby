import Link from "next/link";

export function AviatorMenuCard({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/games/aviator"
      aria-label="Play Aviator"
      className={`group relative isolate flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl border border-lime-300/25 bg-[#071523] p-5 transition duration-200 hover:border-lime-300/50 hover:shadow-xl hover:shadow-lime-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_15%,rgba(163,230,53,0.2),transparent_42%),linear-gradient(135deg,rgba(8,25,40,0.1),rgba(2,6,23,0.9))]" />
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-lime-300/25 bg-lime-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-lime-200">
          <span className="size-1.5 rounded-full bg-lime-300" /> Playable now
        </span>
        <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-xl text-lime-200" aria-hidden="true">✈</span>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">PlayerLobby original</p>
        <h3 className="mt-1 text-2xl font-black tracking-tight text-white">Aviator</h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">Watch the multiplier climb, place your bet, and cash out before the flight ends.</p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-lime-300 px-4 py-2.5 text-xs font-black text-slate-950 transition group-hover:bg-lime-200">
          Play Aviator <span aria-hidden="true">→</span>
        </span>
      </div>
      <span className="pointer-events-none absolute -right-4 bottom-5 -z-10 select-none text-[110px] font-black leading-none text-white/[0.035]" aria-hidden="true">A</span>
    </Link>
  );
}
