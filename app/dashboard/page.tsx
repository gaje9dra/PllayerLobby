import type { Metadata } from "next";
import Link from "next/link";
import { PaymentStatus, RegistrationStatus } from "@/app/generated/prisma/client";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SectionContainer } from "@/components/ui/section-container";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ProfileCard } from "@/components/dashboard/profile-card";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { QuickActions } from "@/components/dashboard/quick-actions";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your ArenaX account and tournament activity.",
};

function registrationStatusLabel(status: RegistrationStatus, paymentStatus: PaymentStatus | null) {
  if (status === RegistrationStatus.CONFIRMED) return "Confirmed";
  if (paymentStatus === PaymentStatus.FAILED) return "Payment Failed";
  if (paymentStatus === PaymentStatus.SUCCESS) return "Payment Successful";
  return "Payment Pending";
}

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const registrations = await prisma.registration.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      createdAt: true,
      tournament: {
        select: {
          name: true,
          slug: true,
          startTime: true,
          entryFee: true,
          game: { select: { name: true } },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  return (
    <SectionContainer className="py-12 sm:py-16 lg:py-20">
      <DashboardHeader name={user.name} />

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <ProfileCard user={user} />
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-7" aria-labelledby="account-overview-title">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Account overview</p>
          <h2 id="account-overview-title" className="mt-2 text-lg font-bold text-white">Account information</h2>
          <dl className="mt-6 space-y-4">
            <div className="flex items-start justify-between gap-5 border-b border-white/5 pb-4">
              <dt className="text-sm text-slate-500">Email</dt>
              <dd className="max-w-[65%] break-all text-right text-sm font-semibold text-white">{user.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-5 border-b border-white/5 pb-4">
              <dt className="text-sm text-slate-500">Status</dt>
              <dd className="rounded-full border border-lime-300/20 bg-lime-300/10 px-2.5 py-1 text-xs font-bold text-lime-300">{user.status}</dd>
            </div>
            <div className="flex items-center justify-between gap-5 border-b border-white/5 pb-4">
              <dt className="text-sm text-slate-500">Role</dt>
              <dd className="text-sm font-semibold text-white">{user.role === "ADMIN" ? "Administrator" : "User"}</dd>
            </div>
            <div className="flex items-center justify-between gap-5">
              <dt className="text-sm text-slate-500">Member since</dt>
              <dd className="text-right text-sm font-semibold text-white">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(user.createdAt)}</dd>
            </div>
          </dl>
          <Link href="/profile" className="mt-7 inline-flex text-sm font-semibold text-lime-300 hover:text-lime-200">View full profile →</Link>
        </section>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <DashboardCard title="My Tournaments" eyebrow="Tournament activity">
          {registrations.length === 0 ? (
            <EmptyState title="No tournaments yet" description="Your registered tournaments will appear here." action={<Button href="/tournaments" variant="secondary">Browse Tournaments</Button>} />
          ) : (
            <div className="space-y-3">
              {registrations.map((registration) => (
                <Link
                  key={registration.id}
                  href={`/tournaments/${registration.tournament.slug}`}
                  className="block rounded-xl border border-white/10 bg-slate-950/30 p-4 transition hover:border-lime-300/20 hover:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{registration.tournament.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{registration.tournament.game.name}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                      {registrationStatusLabel(registration.status, registration.payments[0]?.status ?? null)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500">
                    <span>Starts {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(registration.tournament.startTime)}</span>
                    <span className="text-right">{registration.tournament.entryFee.toFixed(2) === "0.00" ? "Free" : `₹${registration.tournament.entryFee.toFixed(2)}`}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </DashboardCard>
        <DashboardCard title="Payment History" eyebrow="Transactions">
          <EmptyState title="Payment history is private" description="Payment records are intentionally kept to safe status information only." />
        </DashboardCard>
        <DashboardCard title="Notifications" eyebrow="Updates">
          <EmptyState title="No notifications yet" description="Important tournament and account updates will appear here when notifications are introduced." />
        </DashboardCard>
      </div>

      <div className="mt-8">
        <QuickActions />
      </div>
    </SectionContainer>
  );
}
