import Link from "next/link";
import { notFound } from "next/navigation";
import { TournamentResultStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTournamentResultSummary } from "@/lib/tournament-result";
import { ResultRow } from "./result-row";

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function pageUrl(tournamentId: string, page: number) { return `/admin/tournaments/${tournamentId}/results?page=${page}`; }

export default async function AdminTournamentResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true, status: true, startTime: true } });
  if (!tournament) notFound();
  const paramsData = await searchParams;
  const requestedPage = Number.parseInt(one(paramsData.page) ?? "1", 10);
  const requested = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const confirmedCount = await prisma.registration.count({ where: { tournamentId: id, status: "CONFIRMED" } });
  const totalPages = Math.max(1, Math.ceil(confirmedCount / PAGE_SIZE));
  const page = Math.min(requested, totalPages);
  const [registrations, summary] = await Promise.all([
    prisma.registration.findMany({ where: { tournamentId: id, status: "CONFIRMED" }, orderBy: { createdAt: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, status: true, user: { select: { name: true, email: true } }, result: { select: { id: true, rank: true, score: true, resultStatus: true } } } }),
    getTournamentResultSummary(id),
  ]);
  const resultEntryAllowed = tournament.status === TournamentStatus.LIVE || tournament.status === TournamentStatus.COMPLETED;
  return <SectionContainer className="py-10 sm:py-14"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href={`/admin/tournaments/${id}`} className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Tournament</Link><h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Results · {tournament.name}</h1><p className="mt-2 text-sm text-slate-400">Record, review, verify, and disqualify official tournament results.</p></div><Button href={`/admin/tournaments/${id}/registrations`} variant="secondary">Participants</Button></div><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5"><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs text-slate-600">Confirmed</p><p className="mt-1 text-2xl font-black text-white">{summary.confirmed}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs text-slate-600">Results Entered</p><p className="mt-1 text-2xl font-black text-white">{summary.entered}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs text-slate-600">Verified</p><p className="mt-1 text-2xl font-black text-lime-200">{summary.verified}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs text-slate-600">Disqualified</p><p className="mt-1 text-2xl font-black text-red-200">{summary.disqualified}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs text-slate-600">Pending Verification</p><p className="mt-1 text-2xl font-black text-white">{summary.pendingVerification}</p></div></div>{!resultEntryAllowed ? <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5 text-sm leading-6 text-amber-100">Result entry is unavailable while this tournament is <strong>{tournament.status}</strong>. Results can be recorded only when the tournament is LIVE or COMPLETED.</div> : null}<div className="mt-6 space-y-3">{registrations.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">No confirmed participants.</div> : registrations.map((registration) => <article key={registration.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1.3fr)] lg:items-center"><div className="min-w-0"><h2 className="truncate text-base font-bold text-white">{registration.user.name || "Unnamed participant"}</h2><p className="mt-1 break-all text-sm text-slate-500">{registration.user.email}</p><p className="mt-2 text-xs text-slate-600">Registration: {registration.status} · ID {registration.id}</p></div><div>{resultEntryAllowed ? <ResultRow tournamentId={id} registrationId={registration.id} result={registration.result ? { id: registration.result.id, rank: registration.result.rank, score: registration.result.score.toString(), resultStatus: registration.result.resultStatus } : null} /> : <span className="text-sm text-slate-600">Waiting for tournament to become LIVE.</span>}</div></div></article>)}</div>{totalPages > 1 ? <nav className="mt-7 flex items-center justify-between"><span className="text-sm text-slate-500">Page {page} / {totalPages}</span><div className="flex gap-2">{page > 1 ? <Link href={pageUrl(id, page - 1)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">Previous</Link> : null}{page < totalPages ? <Link href={pageUrl(id, page + 1)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">Next</Link> : null}</div></nav> : null}</SectionContainer>;
}
