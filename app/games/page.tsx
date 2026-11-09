import { SectionContainer } from "@/components/ui/section-container";
import { AviatorMenuCard } from "@/components/layout/aviator-menu-card";
import { siteConfig } from "@/config/site";

export default function GamesPage() {
  return (
    <SectionContainer className="min-h-[70vh] py-16 sm:py-20">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">
          {siteConfig.name} arcade
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
          Games
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-400">
          Explore the games available on PlayerLobby. Choose a game to view its
          profile and jump in.
        </p>
      </div>

      <section className="mt-10" aria-labelledby="available-games-heading">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="available-games-heading" className="text-sm font-bold uppercase tracking-[0.16em] text-slate-300">
            Available now
          </h2>
          <span className="rounded-full border border-lime-300/20 bg-lime-300/5 px-3 py-1 text-xs font-semibold text-lime-200">
            1 game
          </span>
        </div>
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <AviatorMenuCard className="min-h-[280px] p-7" />
        </div>
      </section>
    </SectionContainer>
  );
}
