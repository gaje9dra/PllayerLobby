import type { Metadata } from "next";
import Link from "next/link";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { TournamentCard } from "@/components/tournaments/tournament-card";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { updateDueTournamentLifecycles } from "@/lib/tournament-lifecycle";

const PAGE_SIZE = 12;
const PUBLIC_STATUSES = [TournamentStatus.UPCOMING, TournamentStatus.REGISTRATION_OPEN, TournamentStatus.REGISTRATION_CLOSED, TournamentStatus.LIVE, TournamentStatus.COMPLETED] as const;
const SORT_OPTIONS = { "starting-soon": { startTime: "asc" }, newest: { createdAt: "desc" }, "prize-high": { prizePool: "desc" }, "fee-low": { entryFee: "asc" }, "fee-high": { entryFee: "desc" } } as const;
type SearchParams = Record<string, string | string[] | undefined>;
type FeeFilter = "all" | "free" | "paid";
type SortKey = keyof typeof SORT_OPTIONS;

export const metadata: Metadata = {
  title: "Tournaments",
  description: "Browse live and upcoming esports tournaments, compare entry fees and prize pools, and find your next match.",
  alternates: { canonical: "/tournaments" },
  openGraph: {
    title: `Tournaments | ${siteConfig.name}`,
    description: "Browse live and upcoming esports tournaments and find your next match.",
    url: "/tournaments",
  },
  twitter: {
    card: "summary",
    title: `Tournaments | ${siteConfig.name}`,
    description: "Browse live and upcoming esports tournaments and find your next match.",
  },
};

function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function pageUrl(params: Record<string, string | number | undefined>) { const search = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value)); const query = search.toString(); return query ? `/tournaments?${query}` : "/tournaments"; }
function statusLabel(status: TournamentStatus) { return status.replaceAll("_", " "); }
function isPublicStatus(value: string): value is (typeof PUBLIC_STATUSES)[number] { return PUBLIC_STATUSES.includes(value as (typeof PUBLIC_STATUSES)[number]); }

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await updateDueTournamentLifecycles();
  const params = await searchParams;
  const query = one(params.q)?.trim() ?? "";
  const requestedGame = one(params.game)?.trim() ?? "";
  const statusParam = one(params.status)?.trim() ?? "";
  const requestedFee = one(params.fee)?.trim() ?? "all";
  const requestedSort = one(params.sort)?.trim() ?? "starting-soon";
  const requestedPage = Number.parseInt(one(params.page) ?? "1", 10);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const games = await prisma.game.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, slug: true, name: true, logoUrl: true } });
  const activeGameSlugs = new Set(games.map((game) => game.slug));
  const game = requestedGame && activeGameSlugs.has(requestedGame) ? requestedGame : "";
  const selectedGameId = game ? games.find((item) => item.slug === game)?.id : undefined;
  const allowedGameIds = selectedGameId ? [selectedGameId] : games.map((item) => item.id);
  const status = isPublicStatus(statusParam) ? statusParam : undefined;
  const fee: FeeFilter = requestedFee === "free" || requestedFee === "paid" ? requestedFee : "all";
  const sort: SortKey = requestedSort in SORT_OPTIONS ? requestedSort as SortKey : "starting-soon";
  const gameIdsForSearch = query ? games.filter((item) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((item) => item.id) : [];
  const where = { status: status ?? { in: [...PUBLIC_STATUSES] }, gameId: { in: allowedGameIds }, ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { slug: { contains: query, mode: "insensitive" as const } }, ...(gameIdsForSearch.length > 0 ? [{ gameId: { in: gameIdsForSearch } }] : [])] } : {}), ...(fee === "free" ? { entryFee: { equals: 0 } } : {}), ...(fee === "paid" ? { entryFee: { gt: 0 } } : {}) };
  const total = await prisma.tournament.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const tournaments = await prisma.tournament.findMany({ where, orderBy: SORT_OPTIONS[sort], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { name: true, slug: true, bannerUrl: true, startTime: true, registrationStartTime: true, registrationEndTime: true, entryFee: true, prizePool: true, maxParticipants: true, tournamentFormat: true, region: true, status: true, gameId: true } });
  const gameById = new Map(games.map((item) => [item.id, item]));
  const publicTournaments = tournaments.flatMap((tournament) => { const gameRecord = gameById.get(tournament.gameId); return gameRecord ? [{ ...tournament, game: { name: gameRecord.name, logoUrl: gameRecord.logoUrl } }] : []; });
  const activeFilterCount = [Boolean(query), Boolean(game), Boolean(status), fee !== "all", sort !== "starting-soon"].filter(Boolean).length;
  const baseParams = { q: query, game, status, fee: fee === "all" ? undefined : fee, sort: sort === "starting-soon" ? undefined : sort };
  const hasFilters = Boolean(query || game || status || fee !== "all" || sort !== "starting-soon");
  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Tournament Arena</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">Tournaments</h1><p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">Browse live and upcoming competitions, compare entry fees and prize pools, and find your next match.</p></div>
      <form method="get" className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"><label className="sr-only" htmlFor="tournament-search">Search tournaments</label><input id="tournament-search" name="q" defaultValue={query} placeholder="Search tournament or game" className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-lime-300/60" /><label className="sr-only" htmlFor="tournament-game">Game</label><select id="tournament-game" name="game" defaultValue={game} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="">All Games</option>{games.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><label className="sr-only" htmlFor="tournament-status">Status</label><select id="tournament-status" name="status" defaultValue={status ?? ""} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="">All Statuses</option>{PUBLIC_STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select><label className="sr-only" htmlFor="tournament-fee">Entry fee</label><select id="tournament-fee" name="fee" defaultValue={fee} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="all">All Fees</option><option value="free">Free</option><option value="paid">Paid</option></select><label className="sr-only" htmlFor="tournament-sort">Sort tournaments</label><select id="tournament-sort" name="sort" defaultValue={sort} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="starting-soon">Starting Soon</option><option value="newest">Newly Added</option><option value="prize-high">Prize Pool: High to Low</option><option value="fee-low">Entry Fee: Low to High</option><option value="fee-high">Entry Fee: High to Low</option></select><Button type="submit">Apply</Button></div></form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><p>{total.toLocaleString()} tournament{total === 1 ? "" : "s"} found{activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active` : ""}</p>{hasFilters ? <Link href="/tournaments" className="font-semibold text-lime-300 hover:text-lime-200">Clear filters</Link> : null}</div>
      {publicTournaments.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center sm:p-14"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-lime-300/10 text-xl font-black text-lime-300" aria-hidden="true">⌕</div><h2 className="mt-5 text-xl font-bold text-white">No tournaments found</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">No public tournaments match your current filters. Try changing your search or filters.</p>{hasFilters ? <Button href="/tournaments" variant="secondary" className="mt-7">Clear filters</Button> : null}</div> : <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{publicTournaments.map((tournament) => <TournamentCard key={tournament.slug} tournament={tournament} />)}</div>}
      {totalPages > 1 ? <nav aria-label="Tournament pagination" className="mt-8 flex items-center justify-between gap-3">{page > 1 ? <Link href={pageUrl({ ...baseParams, page: page - 1 })} className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">Previous</Link> : <span />}<span className="text-sm text-slate-500">Page {page} / {totalPages}</span>{page < totalPages ? <Link href={pageUrl({ ...baseParams, page: page + 1 })} className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">Next</Link> : <span />}</nav> : null}
    </SectionContainer>
  );
}
