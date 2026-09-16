import { requireAdmin } from "@/lib/auth";
import { SectionContainer } from "@/components/ui/section-container";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

export default async function AdminPage() {
  const user = await requireAdmin();

  const [tournaments, pendingResults, disputedResults, missingRooms, staleAccessCodes, cancelledMatches, recentAudits] = await Promise.all([
    prisma.tournament.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "MatchResult" WHERE "status" = 'PENDING'`),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "MatchResult" WHERE "status" = 'DISPUTED'`),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "TournamentBracketMatch" m LEFT JOIN "MatchRoomCredential" r ON r."matchId" = m."id" WHERE m."status" IN ('PENDING','READY','LIVE') AND (r."id" IS NULL OR r."revokedAt" IS NOT NULL OR r."publishedAt" IS NULL)`),
    prisma.tournamentAccessCode.count({ where: { status: "ACTIVE", expiresAt: { not: null, lt: new Date() } } }),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "TournamentBracketMatch" WHERE "status" = 'CANCELLED'`),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "AdminAuditLog" WHERE "createdAt" >= NOW() - INTERVAL '24 hours'`),
  ]);

  const count = (rows: Array<{ count: bigint }>) => Number(rows[0]?.count ?? 0n);
  const statusCounts = new Map(tournaments.map((item) => [item.status, item._count._all]));
  const operationalAlerts = [
    { label: "Pending results", value: count(pendingResults), href: "/admin/tournaments", tone: "amber" },
    { label: "Disputed results", value: count(disputedResults), href: "/admin/tournaments", tone: "rose" },
    { label: "Missing/unpublished rooms", value: count(missingRooms), href: "/admin/tournaments", tone: "amber" },
    { label: "Expired active access codes", value: staleAccessCodes, href: "/admin/tournaments", tone: "rose" },
  ];

  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Administration</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Admin Panel</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Operate tournaments from the existing authoritative systems without exposing credentials or mutating financial records.</p>
        </div>
        <div className="flex flex-wrap gap-3"><Button href="/admin/games" variant="secondary">Manage Games</Button><Button href="/admin/tournaments">Manage Tournaments</Button></div>
      </div>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-lime-300">Live operations</p><h2 className="mt-2 text-xl font-black text-white">Operational alerts</h2></div><p className="text-xs text-slate-600">Read-only overview · server-side counts</p></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {operationalAlerts.map((alert) => <a key={alert.label} href={alert.href} className="rounded-xl border border-white/10 bg-black/10 p-4 transition hover:border-white/20"><div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-400">{alert.label}</span><span className={`text-2xl font-black ${alert.tone === "rose" ? "text-rose-300" : "text-amber-200"}`}>{alert.value.toLocaleString()}</span></div><p className="mt-3 text-xs font-semibold text-slate-600">Open tournament operations →</p></a>)}
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tournament status</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{["DRAFT","UPCOMING","REGISTRATION_OPEN","REGISTRATION_CLOSED","LIVE","COMPLETED","CANCELLED"].map((status) => <div key={status} className="rounded-xl border border-white/10 p-3"><p className="text-[11px] font-semibold text-slate-600">{status.replaceAll("_", " ")}</p><p className="mt-1 text-xl font-black text-white">{(statusCounts.get(status as never) ?? 0).toLocaleString()}</p></div>)}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Consistency signals</p><div className="mt-5 space-y-3"><Signal label="Cancelled bracket matches" value={count(cancelledMatches)} /><Signal label="Audit events (24h)" value={count(recentAudits)} /><Signal label="Expired active access codes" value={staleAccessCodes} /></div><Button href="/admin/tournaments" variant="secondary" className="mt-5">Inspect Tournament Operations</Button></div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Current account</p><p className="mt-3 font-semibold text-white">{user.email}</p><p className="mt-1 text-sm text-slate-500">Role: {user.role} · Status: {user.status}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Game management</p><p className="mt-3 text-sm leading-6 text-slate-400">Add, edit, activate, or deactivate games without changing tournament history.</p><Button href="/admin/games" variant="secondary" className="mt-5">Manage Games</Button></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tournament management</p><p className="mt-3 text-sm leading-6 text-slate-400">Create tournament drafts using the secure server-side admin workflow.</p><Button href="/admin/tournaments/create" variant="secondary" className="mt-5">Create Tournament</Button></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Finance</p><p className="mt-3 text-sm leading-6 text-slate-400">Open the authoritative finance dashboard and inspect wallets, deposits, and existing payout operations.</p><div className="mt-5 flex flex-wrap gap-3"><Button href="/admin/finance" variant="secondary">Finance Dashboard</Button><Button href="/admin/finance/wallets" variant="secondary">Wallets</Button><Button href="/admin/finance/deposits" variant="secondary">Deposits</Button></div></div>
      </div>
    </SectionContainer>
  );
}

function Signal({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between rounded-xl border border-white/10 p-4"><span className="text-sm text-slate-400">{label}</span><span className="text-lg font-black text-white">{value.toLocaleString()}</span></div>; }
