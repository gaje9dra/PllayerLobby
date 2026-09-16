import Link from "next/link";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { TournamentStatusBadge } from "@/components/admin/tournament-status-badge";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateDueTournamentLifecycles } from "@/lib/tournament-lifecycle";
import { getDueTournamentStatus } from "@/lib/tournament-lifecycle-rules";
import { formatAppDateTime } from "@/lib/timezone";

const PAGE_SIZE = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SORT_OPTIONS = { newest: { createdAt: "desc" }, oldest: { createdAt: "asc" }, start_asc: { startTime: "asc" }, start_desc: { startTime: "desc" } } as const;
type SearchParams = Record<string, string | string[] | undefined>;
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function pageUrl(params: Record<string, string | number | undefined>) { const search = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value)); const query = search.toString(); return query ? `/admin/tournaments?${query}` : "/admin/tournaments"; }
function parseDateStart(value: string) { const parsed = new Date(`${value}T00:00:00`); return Number.isNaN(parsed.getTime()) ? undefined : parsed; }
function parseDateEnd(value: string) { const parsed = new Date(`${value}T23:59:59.999`); return Number.isNaN(parsed.getTime()) ? undefined : parsed; }

export default async function AdminTournamentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  await updateDueTournamentLifecycles();
  const params = await searchParams;
  const query = one(params.q)?.trim() ?? "";
  const requestedGameId = one(params.gameId) ?? "";
  const gameId = UUID_PATTERN.test(requestedGameId) ? requestedGameId : "";
  const statusParam = one(params.status) ?? "";
  const sortParam = one(params.sort) ?? "newest";
  const dateFrom = one(params.dateFrom)?.trim() ?? "";
  const dateTo = one(params.dateTo)?.trim() ?? "";
  const requestedPage = Number.parseInt(one(params.page) ?? "1", 10);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const sort = sortParam in SORT_OPTIONS ? sortParam as keyof typeof SORT_OPTIONS : "newest";
  const status = Object.values(TournamentStatus).includes(statusParam as TournamentStatus) ? statusParam as TournamentStatus : undefined;
  const startDate = parseDateStart(dateFrom);
  const endDate = parseDateEnd(dateTo);
  const games = await prisma.game.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const where = { ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { slug: { contains: query, mode: "insensitive" as const } }, ...(UUID_PATTERN.test(query) ? [{ id: query }] : [])] } : {}), ...(gameId ? { gameId } : {}), ...(status ? { status } : {}), ...(startDate || endDate ? { startTime: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}) };
  const total = await prisma.tournament.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const tournaments = await prisma.tournament.findMany({ where, orderBy: SORT_OPTIONS[sort], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, name: true, slug: true, startTime: true, registrationStartTime: true, registrationEndTime: true, entryFee: true, prizePool: true, maxParticipants: true, status: true, tournamentFormat: true, region: true, createdAt: true, updatedAt: true, game: { select: { name: true, logoUrl: true } }, _count: { select: { registrations: true } } } });
  const now = new Date();
  const baseParams = { q: query, gameId, status, dateFrom, dateTo, sort };
  const hasFilters = Boolean(query || gameId || status || dateFrom || dateTo);
  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Administration</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Tournaments</h1><p className="mt-2 text-sm text-slate-400">Create, configure, publish, edit, and cancel tournaments safely.</p></div><Button href="/admin/tournaments/create">Create Tournament</Button></div>
      <form method="get" className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"><input name="q" defaultValue={query} placeholder="Search name, slug, or ID" className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-lime-300/60" /><select name="gameId" defaultValue={gameId} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="">All games</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select><select name="status" defaultValue={status ?? ""} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="">All statuses</option>{Object.values(TournamentStatus).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3"><span className="text-xs text-slate-600">From</span><input name="dateFrom" type="date" defaultValue={dateFrom} className="min-w-0 bg-transparent text-sm text-white outline-none" /></label><label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3"><span className="text-xs text-slate-600">To</span><input name="dateTo" type="date" defaultValue={dateTo} className="min-w-0 bg-transparent text-sm text-white outline-none" /></label><div className="flex gap-2"><select name="sort" defaultValue={sort} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="start_asc">Start soonest</option><option value="start_desc">Start latest</option></select><Button type="submit">Filter</Button></div></div></form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><p>{total.toLocaleString()} tournament{total === 1 ? "" : "s"} found · Page {page} of {totalPages}</p>{hasFilters ? <Link href="/admin/tournaments" className="font-semibold text-lime-300 hover:text-lime-200">Clear filters</Link> : null}</div>
      {tournaments.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center"><p className="text-lg font-bold text-white">No tournaments match these filters.</p><p className="mt-2 text-sm text-slate-500">Try a different search, game, status, or date range.</p></div> : <div className="mt-5 grid gap-4">{tournaments.map((tournament) => { const due = getDueTournamentStatus({ status: tournament.status, startTime: tournament.startTime, registrationStartTime: tournament.registrationStartTime, registrationEndTime: tournament.registrationEndTime }, now); return <article key={tournament.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold text-white">{tournament.name}</h2><TournamentStatusBadge status={tournament.status} />{due ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs font-bold text-amber-200">Transition due: {due.replaceAll("_", " ")}</span> : null}</div><p className="mt-1 break-all text-sm text-slate-500">{tournament.game.name} · {tournament.tournamentFormat} · {tournament.region} · /{tournament.slug}</p></div><div className="flex flex-wrap gap-2"><Button href={`/admin/tournaments/${tournament.id}`} variant="secondary">View</Button><Button href={`/admin/tournaments/${tournament.id}/edit`} variant="secondary">Edit</Button></div></div><dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-5"><div><dt className="text-xs text-slate-600">Tournament start</dt><dd className="mt-1 text-sm text-slate-300">{formatAppDateTime(tournament.startTime)}</dd></div><div><dt className="text-xs text-slate-600">Registration</dt><dd className="mt-1 text-sm text-slate-300">{tournament.registrationStartTime ? formatAppDateTime(tournament.registrationStartTime) : "—"}</dd><dd className="text-sm text-slate-500">to {tournament.registrationEndTime ? formatAppDateTime(tournament.registrationEndTime) : "—"}</dd></div><div><dt className="text-xs text-slate-600">Entry / prize</dt><dd className="mt-1 text-sm font-semibold text-white">₹{tournament.entryFee.toFixed(2)} / ₹{tournament.prizePool.toFixed(2)}</dd></div><div><dt className="text-xs text-slate-600">Participants</dt><dd className="mt-1 text-sm font-semibold text-white">{tournament._count.registrations.toLocaleString()} / {tournament.maxParticipants?.toLocaleString() ?? "Open"}</dd></div><div><dt className="text-xs text-slate-600">Created</dt><dd className="mt-1 text-sm text-slate-300">{formatAppDateTime(tournament.createdAt)}</dd></div></dl></article>; })}</div>}
      {totalPages > 1 ? <nav aria-label="Tournament pagination" className="mt-7 flex items-center justify-between gap-3">{page > 1 ? <Link href={pageUrl({ ...baseParams, page: page - 1 })} className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">Previous</Link> : <span />}<span className="text-sm text-slate-500">Page {page} / {totalPages}</span>{page < totalPages ? <Link href={pageUrl({ ...baseParams, page: page + 1 })} className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">Next</Link> : <span />}</nav> : null}
    </SectionContainer>
  );
}
