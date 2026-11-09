import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/lib/auth";

const steps = [
  ["01", "Create your account", "Sign in securely and keep your tournament activity in one place."],
  ["02", "Choose a tournament", "Find the competition that matches your game and skill level."],
  ["03", "Register & enter", "Complete the registration flow when tournaments go live."],
  ["04", "Compete", "Get your joining details and show up ready to play."],
] as const;

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(163,230,53,0.16),transparent_30%),radial-gradient(circle_at_15%_30%,rgba(34,211,238,0.08),transparent_28%)]" />
        <SectionContainer className="relative flex min-h-[620px] items-center py-20 lg:py-28">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-lime-200">
              <span className="size-1.5 rounded-full bg-lime-300" /> Competitive gaming platform
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.04em] text-white sm:text-7xl lg:text-8xl">
              PLAY HARD.<br />
              <span className="text-lime-300">WIN BIG.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              A dedicated home for competitive gaming tournaments. Discover upcoming events, compete with other players, and build your tournament record.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button href="/tournaments">Browse Tournaments</Button>
              {user ? (
                <Button href="/dashboard" variant="secondary">Go to Dashboard</Button>
              ) : (
                <Button href="/login" variant="secondary">Get Started with Google</Button>
              )}
            </div>
          </div>
        </SectionContainer>
      </section>

      <SectionContainer className="py-20 sm:py-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Games</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Pick your next game</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate-500">Jump into Aviator now. More tournament titles can be added as they become available.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link
            href="/games/aviator"
            aria-label="Play Aviator"
            className="group relative isolate flex min-h-[280px] flex-col justify-between overflow-hidden rounded-2xl border border-lime-300/25 bg-[#071523] p-7 transition duration-200 hover:-translate-y-1 hover:border-lime-300/50 hover:shadow-2xl hover:shadow-lime-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_15%,rgba(163,230,53,0.2),transparent_42%),linear-gradient(135deg,rgba(8,25,40,0.1),rgba(2,6,23,0.9))]" />
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-lime-200">
                <span className="size-1.5 rounded-full bg-lime-300" /> Playable now
              </span>
              <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-2xl text-lime-200" aria-hidden="true">✈</span>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">PlayerLobby original</p>
              <h3 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">Aviator</h3>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">Watch the multiplier climb, place your bet, and cash out before the flight ends.</p>
              <span className="mt-6 inline-flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 transition group-hover:bg-lime-200">
                Play Aviator <span aria-hidden="true">→</span>
              </span>
            </div>
            <span className="pointer-events-none absolute -right-8 bottom-12 -z-10 select-none text-[170px] font-black leading-none text-white/[0.035]" aria-hidden="true">A</span>
          </Link>

          {siteConfig.games.map((game, index) => (
            <div key={game} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-white/20 hover:bg-white/[0.05]">
              <span className="text-sm font-bold text-slate-600">0{index + 2}</span>
              <h3 className="mt-14 text-3xl font-black tracking-tight text-white">{game}</h3>
              <p className="mt-2 text-sm text-slate-500">Tournament support coming soon.</p>
              <div className="absolute right-6 top-6 size-20 rounded-full border border-white/10 bg-white/[0.03] blur-[1px] transition group-hover:scale-110" />
            </div>
          ))}
        </div>
      </SectionContainer>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <SectionContainer className="py-20 sm:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">How it works</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl">From sign-in to game time.</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-4">
            {steps.map(([number, title, description]) => (
              <div key={number} className="bg-slate-950 p-6 sm:p-7">
                <span className="text-xs font-black tracking-widest text-lime-300">{number}</span>
                <h3 className="mt-10 font-bold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </SectionContainer>
      </section>

      <SectionContainer className="py-20 sm:py-24">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-6 py-14 text-center sm:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Upcoming tournaments</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white">Your next match starts here.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">Upcoming tournaments will appear here once the tournament system is launched.</p>
          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-dashed border-white/10 px-5 py-10 text-sm text-slate-600">No tournaments available yet.</div>
        </div>
      </SectionContainer>
    </>
  );
}
