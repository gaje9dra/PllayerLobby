import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RegistrationStatus,
  TournamentStatus,
} from "@/app/generated/prisma/client";
import { CancelRegistrationButton } from "@/app/admin/tournaments/[id]/registrations/cancel-registration-button";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAdminCancelRegistration } from "@/lib/admin-registration-rules";
import { formatAppDateTime } from "@/lib/timezone";

type SearchParams = Promise<{ cancelled?: string }>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</dt><dd className="mt-1 break-words text-sm text-slate-200">{children}</dd></div>;
}

function statusClass(value: string) {
  if (value === "CONFIRMED" || value === "SUCCESS" || value === "ACTIVE" || value === "Configured" || value === "Generated") return "border-lime-300/20 bg-lime-300/10 text-lime-200";
  if (value === "PENDING" || value === "INITIATED" || value === "Not Generated") return "border-amber-300/20 bg-amber-300/10 text-amber-200";
  return "border-rose-300/20 bg-rose-300/10 text-rose-200";
}

function Badge({ value }: { value: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusClass(value)}`}>{value.replaceAll("_", " ")}</span>;
}

export default async function AdminRegistrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; registrationId: string }>;
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { id: tournamentId, registrationId } = await params;
  const { cancelled } = await searchParams;

  if (!UUID_PATTERN.test(tournamentId) || !UUID_PATTERN.test(registrationId)) notFound();

  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      tournamentId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true, image: true, status: true, createdAt: true } },
      tournament: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          entryFee: true,
          maxParticipants: true,
          game: { select: { id: true, name: true } },
          room: { select: { createdAt: true, publishedAt: true, revokedAt: true, updatedAt: true } },
        },
      },
      code: { select: { createdAt: true, updatedAt: true, revokedAt: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          merchantTransactionId: true,
          payuTransactionId: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!registration || registration.tournamentId !== tournamentId || registration.tournament.id !== tournamentId) notFound();

  const codeStatus = !registration.code ? "Not Generated" : registration.code.revokedAt ? "Revoked" : "Generated";
  const roomStatus = !registration.tournament.room ? "Not Configured" : registration.tournament.room.revokedAt ? "Revoked/Disabled" : "Configured";
  const canCancel = canAdminCancelRegistration(registration.tournament.status, registration.status);
  const latestPayment = registration.payments[0];

  return (
    <SectionContainer className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link href={`/admin/tournaments/${tournamentId}/registrations`} className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Back to registrations</Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Registration detail</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{registration.user.name || "Unnamed participant"}</h1>
          <p className="mt-2 text-sm text-slate-500">{registration.user.email}</p>
        </div>
        <Button href={`/admin/tournaments/${tournamentId}`} variant="secondary">Tournament</Button>
      </div>

      {cancelled === "1" ? <div role="status" className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-200">Registration cancelled. Payment history was preserved and registration-code access was revoked. No refund was processed.</div> : null}

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-white">Registration</h2><p className="mt-1 text-sm text-slate-500">Operational registration information from PostgreSQL.</p></div><Badge value={registration.status} /></div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Registration ID"><span className="font-mono text-xs">{registration.id}</span></Detail>
          <Detail label="Participant">{registration.user.name || "Unnamed participant"}</Detail>
          <Detail label="Email">{registration.user.email}</Detail>
          <Detail label="User status"><Badge value={registration.user.status} /></Detail>
          <Detail label="Registration status"><Badge value={registration.status} /></Detail>
          <Detail label="Entry fee">₹{registration.tournament.entryFee.toFixed(2)}</Detail>
          <Detail label="Registered">{formatAppDateTime(registration.createdAt)}</Detail>
          <Detail label="Last updated">{formatAppDateTime(registration.updatedAt)}</Detail>
          <Detail label="Registration code"><Badge value={codeStatus} /></Detail>
          <Detail label="Code created">{registration.code ? formatAppDateTime(registration.code.createdAt) : "—"}</Detail>
          <Detail label="Code revoked">{registration.code?.revokedAt ? formatAppDateTime(registration.code.revokedAt) : "—"}</Detail>
          <Detail label="Room status"><Badge value={roomStatus} /></Detail>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <div><h2 className="text-lg font-bold text-white">Tournament</h2><p className="mt-1 text-sm text-slate-500">The registration is server-verified against this tournament.</p></div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Tournament">{registration.tournament.name}</Detail>
          <Detail label="Slug">/{registration.tournament.slug}</Detail>
          <Detail label="Game">{registration.tournament.game.name}</Detail>
          <Detail label="Tournament status"><Badge value={registration.tournament.status} /></Detail>
          <Detail label="Maximum participants">{registration.tournament.maxParticipants?.toLocaleString() ?? "Unlimited"}</Detail>
          <Detail label="Room configured">{registration.tournament.room ? "Yes" : "No"}</Detail>
          <Detail label="Room published">{registration.tournament.room?.publishedAt ? formatAppDateTime(registration.tournament.room.publishedAt) : "—"}</Detail>
          <Detail label="Room revoked">{registration.tournament.room?.revokedAt ? formatAppDateTime(registration.tournament.room.revokedAt) : "—"}</Detail>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <div><h2 className="text-lg font-bold text-white">Payment history</h2><p className="mt-1 text-sm text-slate-500">Read-only payment information. PayU verification remains the source of payment status.</p></div>
        {registration.payments.length === 0 ? <p className="mt-6 text-sm text-slate-500">No payment record exists for this registration.</p> : <div className="mt-6 grid gap-3">{registration.payments.map((payment) => <div key={payment.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><Badge value={payment.status} /><span className="font-semibold text-white">₹{payment.amount.toFixed(2)} {payment.currency}</span></div><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Detail label="Merchant transaction ID"><span className="font-mono text-xs">{payment.merchantTransactionId}</span></Detail><Detail label="PayU reference ID">{payment.payuTransactionId || "—"}</Detail><Detail label="Created">{formatAppDateTime(payment.createdAt)}</Detail><Detail label="Updated">{formatAppDateTime(payment.updatedAt)}</Detail></dl></div>)}</div>}
        {latestPayment ? <p className="mt-5 text-xs text-slate-600">Latest payment status: {latestPayment.status.replaceAll("_", " ")}. This page does not provide a manual payment-status control.</p> : null}
      </section>

      <section className="mt-6 rounded-2xl border border-rose-400/15 bg-rose-400/[0.03] p-5 sm:p-7">
        <h2 className="text-lg font-bold text-white">Registration actions</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Cancellation preserves the registration and payment history and revokes any registration code. This action does not process a refund.</p>
        <div className="mt-5 max-w-sm"><CancelRegistrationButton tournamentId={tournamentId} registrationId={registration.id} disabled={!canCancel} /></div>
        {!canCancel ? <p className="mt-3 text-xs text-slate-600">{registration.status === RegistrationStatus.CANCELLED ? "This registration is already cancelled." : registration.tournament.status === TournamentStatus.COMPLETED ? "Completed tournaments cannot have registrations cancelled." : "Cancelled tournaments cannot have registrations changed."}</p> : null}
      </section>
    </SectionContainer>
  );
}
