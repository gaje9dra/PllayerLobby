import { requireAdmin } from "@/lib/auth";
import { listGames } from "@/lib/game-management";
import { GamesManager } from "@/app/admin/games/games-manager";
import { SectionContainer } from "@/components/ui/section-container";

export default async function AdminGamesPage() {
  await requireAdmin();
  const games = await listGames({ status: "ALL" });
  const initialGames = games.map((game) => ({
    id: game.id,
    name: game.name,
    slug: game.slug,
    description: game.description,
    logoUrl: game.logoUrl,
    isActive: game.isActive,
    createdAt: game.createdAt.toISOString(),
    tournamentCount: game._count.tournaments,
  }));

  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Administration</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Games</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Manage the games available on PlayerLobby. Deactivating a game preserves its tournament history.</p>
        </div>
      </div>
      <div className="mt-8"><GamesManager initialGames={initialGames} /></div>
    </SectionContainer>
  );
}
