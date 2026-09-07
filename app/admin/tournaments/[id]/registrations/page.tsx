import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PaymentStatus,
  RegistrationStatus,
  UserStatus,
} from "@/app/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_REGISTRATION_PAGE_SIZE,
  ADMIN_REGISTRATION_SORTS,
  parseAdminRegistrationPage,
  parseAdminRegistrationSearch,
  parseAdminRegistrationSort,
  parsePaymentStatus,
  parseRegistrationStatus,
  parseUserStatus,
} from "@/lib/admin-registration-rules";
import { formatAppDateTime } from "@/lib/timezone";

type SearchParams = Record<string, string | string[] | undefined>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function queryUrl(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return `/admin/tournaments/${params.tournamentId}/registrations?${search.toString()}`;
}

function badgeClass(value: string) {
  if (value === "CONFIRMED" || value === "SUCCESS" || value === "ACTIVE" || value === "Configured" || value === "Generated") return "border-lime-300/20 bg-lime-300/10 text-lime-200";
  if (value === "PENDING" || value === "INITIATED" || value === "Not Generated") return "border-amber-300/20 bg-amber-300/10 text-amber-200";
  return "border-rose-300/20 bg-rose-300/10 text-rose-200";
}

function Badge({ children }: { children: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeClass(children)}`}>{children.replaceAll("_", " ")}</span>;
}

function paymentLabel(status: PaymentStatus | undefined) {
  return status ?? "—";
}

function codeLabel(code: { revokedAt: Date | null } | null) {
  if (!code) return "Not Generated";
  return code.revokedAt ? "Revoked" : "Generated";
}

function roomLabel(room: { publishedAt: Date | null; revokedAt: Date | null } | null) {
  if (!room) return "Not Configured";
  if (room.revokedAt) return "Revoked/Disabled";
  return "Configured";
}

export default async function AdminRegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const { id: tournamentId } = await params;
  const paramsValue = await searchParams;

  if (!UUID_PATTERN.test(tournamentId)) notFound();

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      name: true,
      status: true,
      entryFee: true,
      maxParticipants: true,
      game: { select: { name: true } },
      room: { select: { publishedAt: true, revokedAt: true } },
    },
  });

  if (!tournament) notFound();

  const q = parseAdminRegistrationSearch(paramsValue.q);
  const registrationStatus = parseRegistrationStatus(paramsValue.status);
  const paymentStatus = parsePaymentStatus(paramsValue.paymentStatus);
  const userStatus = parseUserStatus(paramsValue.userStatus);
  const sort = parseAdminRegistrationSort(paramsValue.sort);
  const requestedPage = parseAdminRegistrationPage(paramsValue.page);

  const qConditions = q
    ? [
        { user: { name: { contains: q, mode: "insensitive" as const } } },
        { user: { email: { contains: q, mode: "insensitive" as const } } },
        { payments: { some: { merchantTransactionId: { contains: q, mode: "insensitive" as const } } } },
        ...(UUID_PATTERN.test(q) ? [{ id: q }] : []),
      ]
    : [];

  const where = {
    tournamentId,
    ...(qConditions.length > 0 ? { OR: qConditions } : {}),
    ...(registrationStatus ? { status: registrationStatus } : {}),
    ...(paymentStatus ? { payments: { some: { status: paymentStatus } } } : {}),
    ...(userStatus ? { user: { status: userStatus } } : {}),
  };

  const [total, confirmedCount] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.count({ where: { tournamentId, status: RegistrationStatus.CONFIRMED } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_REGISTRATION_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const registrations = await prisma.registration.findMany({
    where,
    orderBy: ADMIN_REGISTRATION_SORTS[sort],
    skip: (page - 1) * ADMIN_REGISTRATION_PAGE_SIZE,
    take: ADMIN_REGISTRATION_PAGE_SIZE,
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true, status: true } },
      code: { select: { createdAt: true, revokedAt: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          amount: true,
          currency: true,
          merchantTransactionId: true,
          payuTransactionId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const remaining = tournament.maxParticipants === null ? null : Math.max(0, tournament.maxParticipants - confirmedCount);
  const baseParams = { tournamentId, q, status: registrationStatus, paymentStatus, userStatus, sort };

  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link href={`/admin/tournaments/${tournamentId}`} className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Back to tournament</Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Registration management</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{tournament.name}</h1>
          <p className="mt-2 text-sm text-slate-500">{tournament.game.name} · {tournament.status.replaceAll("_", " ")}</p>
        </div>
        <Button href={`/admin/tournaments/${tournamentId}/room`} variant="secondary">Manage Room</Button>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Confirmed participants</p><p className="mt-2 text-2xl font-black text-white">{confirmedCount.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Maximum</p><p className="mt-2 text-2xl font-black text-white">{tournament.maxParticipants?.toLocaleString() ?? "Unlimited"}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Remaining</p><p className="mt-2 text-2xl font-black text-white">{remaining === null ? "Unlimited" : remaining.toLocaleString()}</p></div>
      </section>

      <form method="get" className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
          <input name="q" defaultValue={q} maxLength={100} placeholder="Search name, email, registration ID, or merchant transaction ID" className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-lime-300/60" />
          <select name="status" defaultValue={registrationStatus ?? ""} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="">All registration statuses</option>{Object.values(RegistrationStatus).map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
          <select name="paymentStatus" defaultValue={paymentStatus ?? ""} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="">All payment statuses</option>{Object.values(PaymentStatus).map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
          <select name="userStatus" defaultValue={userStatus ?? ""} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="">All user statuses</option>{Object.values(UserStatus).map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select name="sort" defaultValue={sort} className="min-h-11 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none focus:border-lime-300/60"><option value="newest">Newest registration</option><option value="oldest">Oldest registration</option><option value="participant_asc">Participant A–Z</option><option value="participant_desc">Participant Z–A</option><option value="status">Registration status</option></select>
          <Button type="submit">Apply</Button>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>{total.toLocaleString()} registration{total === 1 ? "" : "s"} found · Page {page} of {totalPages}</p>
        {q || registrationStatus || paymentStatus || userStatus ? <Link href={`/admin/tournaments/${tournamentId}/registrations`} className="font-semibold text-lime-300 hover:text-lime-200">Clear filters</Link> : null}
      </div>

      {registrations.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center"><p className="text-lg font-bold text-white">No registrations match these filters.</p><p className="mt-2 text-sm text-slate-500">Try a different search or filter.</p></div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-left">
              <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-wide text-slate-600">
                <tr><th className="px-5 py-4">Participant</th><th className="px-5 py-4">Registration</th><th className="px-5 py-4">Payment</th><th className="px-5 py-4">Amount</th><th className="px-5 py-4">Registered</th><th className="px-5 py-4">Code</th><th className="px-5 py-4">Room</th><th className="px-5 py-4">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {registrations.map((registration) => {
                  const payment = registration.payments[0];
                  const paymentText = paymentLabel(payment?.status);
                  const codeText = codeLabel(registration.code);
                  const roomText = roomLabel(tournament.room);
                  return (
                    <tr key={registration.id} className="align-top hover:bg-white/[0.02]">
                      <td className="px-5 py-5"><p className="font-semibold text-white">{registration.user.name || "Unnamed participant"}</p><p className="mt-1 text-sm text-slate-500">{registration.user.email}</p><div className="mt-2"><Badge>{registration.user.status}</Badge></div></td>
                      <td className="px-5 py-5"><Badge>{registration.status}</Badge><p className="mt-2 max-w-[180px] break-all font-mono text-[11px] text-slate-600">{registration.id}</p></td>
                      <td className="px-5 py-5"><Badge>{paymentText}</Badge>{payment?.payuTransactionId ? <p className="mt-2 max-w-[180px] break-all text-xs text-slate-600">PayU: {payment.payuTransactionId}</p> : null}</td>
                      <td className="px-5 py-5 font-semibold text-white">₹{(payment?.amount ?? tournament.entryFee).toFixed(2)} {payment?.currency ?? "INR"}</td>
                      <td className="px-5 py-5 text-sm text-slate-400">{formatAppDateTime(registration.createdAt)}<p className="mt-1 text-xs text-slate-600">Updated {formatAppDateTime(registration.updatedAt)}</p></td>
                      <td className="px-5 py-5"><Badge>{codeText}</Badge></td>
                      <td className="px-5 py-5"><Badge>{roomText}</Badge></td>
                      <td className="px-5 py-5"><Button href={`/admin/tournaments/${tournamentId}/registrations/${registration.id}`} variant="secondary">View</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Registration pagination" className="mt-7 flex items-center justify-between gap-3">
          {page > 1 ? <Link href={queryUrl({ ...baseParams, page: page - 1 })} className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">Previous</Link> : <span />}
          <span className="text-sm text-slate-500">Page {page} / {totalPages}</span>
          {page < totalPages ? <Link href={queryUrl({ ...baseParams, page: page + 1 })} className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">Next</Link> : <span />}
        </nav>
      ) : null}
    </SectionContainer>
  );
}
