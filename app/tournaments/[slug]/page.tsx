import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { TournamentRegistration, type RegistrationAvailability } from "@/components/tournaments/tournament-registration";
import { TournamentStatusBadge } from "@/components/tournaments/tournament-status-badge";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/ui/section-container";
import { getCurrentUser } from "@/lib/auth";
import { canRegisterForTournament } from "@/lib/registration-eligibility";
import { REGISTRATION_ELIGIBILITY_REASONS } from "@/lib/registration-eligibility-rules";
import { formatAppDateTime, appTimeZoneLabel } from "@/lib/timezone";
import { prisma } from "@/lib/prisma";

const PUBLIC_STATUSES = [
  TournamentStatus.UPCOMING,
  TournamentStatus.REGISTRATION_OPEN,
  TournamentStatus.REGISTRATION_CLOSED,
  TournamentStatus.LIVE,
  TournamentStatus.COMPLETED,
] as const;

function safeImageUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatStatus(status: TournamentStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTournamentFormat(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatMoney(value: { toFixed: (digits?: number) => string }) {
  return `₹${value.toFixed(2)}`;
}

async function getPublicTournament(slug: string) {
  return prisma.tournament.findFirst({
    where: {
      slug,
      status: { in: [...PUBLIC_STATUSES] },
      game: { isActive: true },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      rules: true,
      bannerUrl: true,
      startTime: true,
      registrationStartTime: true,
      registrationEndTime: true,
      entryFee: true,
      prizePool: true,
      maxParticipants: true,
      tournamentFormat: true,
      region: true,
      status: true,
      joiningWindowMinutes: true,
      game: {
        select: {
          name: true,
          logoUrl: true,
        },
      },
    },
  });
}

async function getRegistrationAvailability(
  tournament: NonNullable<Awaited<ReturnType<typeof getPublicTournament>>>,
): Promise<RegistrationAvailability> {
  const user = await getCurrentUser();

  if (!user) return "LOGIN";
  if (tournament.status === TournamentStatus.COMPLETED) return "COMPLETED";
  if (tournament.status === TournamentStatus.UPCOMING) return "REGISTRATION_NOT_STARTED";

  const eligibility = await canRegisterForTournament(user, tournament.id);

  if (eligibility.allowed) return "REGISTER";

  switch (eligibility.reason) {
    case REGISTRATION_ELIGIBILITY_REASONS.ALREADY_REGISTERED:
      return "ALREADY_REGISTERED";
    case REGISTRATION_ELIGIBILITY_REASONS.TOURNAMENT_FULL:
      return "TOURNAMENT_FULL";
    case REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_NOT_STARTED:
      return "REGISTRATION_NOT_STARTED";
    case REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_NOT_OPEN:
    case REGISTRATION_ELIGIBILITY_REASONS.REGISTRATION_CLOSED:
      return "REGISTRATION_CLOSED";
    default:
      return "UNAVAILABLE";
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await getPublicTournament(slug);

  if (!tournament) {
    return {
      title: "Tournament Not Found | PlayerLobby",
      description: "The requested public tournament could not be found.",
    };
  }

  const description = tournament.description?.trim() || `${tournament.game.name} tournament on PlayerLobby. Starts ${formatAppDateTime(tournament.startTime)}.`;
  const bannerUrl = safeImageUrl(tournament.bannerUrl);

  return {
    title: `${tournament.name} | PlayerLobby`,
    description: description.slice(0, 160),
    openGraph: {
      title: `${tournament.name} | PlayerLobby`,
      description: description.slice(0, 160),
      ...(bannerUrl ? { images: [bannerUrl] } : {}),
    },
  };
}

function InfoItem({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">{label}</dt>
      <dd className={`mt-2 text-sm font-bold sm:text-base ${emphasis ? "text-lime-200" : "text-white"}`}>{value}</dd>
    </div>
  );
}

export default async function TournamentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tournament = await getPublicTournament(slug);

  if (!tournament) notFound();

  const registrationAvailability = await getRegistrationAvailability(tournament);
  const bannerUrl = safeImageUrl(tournament.bannerUrl);
  const logoUrl = safeImageUrl(tournament.game.logoUrl);
  const registrationStart = tournament.registrationStartTime
    ? formatAppDateTime(tournament.registrationStartTime)
    : "Not announced";
  const registrationEnd = tournament.registrationEndTime
    ? formatAppDateTime(tournament.registrationEndTime)
    : "Not announced";
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/tournaments/${slug}`)}`;

  return (
    <main>
      <SectionContainer className="py-8 sm:py-12">
        <Button href="/tournaments" variant="secondary" className="mb-5">
          ← Back to Tournaments
        </Button>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] shadow-2xl shadow-black/20">
          <div className="relative min-h-[300px] overflow-hidden bg-slate-950 sm:min-h-[380px]">
            {bannerUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${JSON.stringify(bannerUrl)})` }}
                aria-hidden="true"
              />
            ) : (
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(163,230,53,0.18),transparent_35%),linear-gradient(135deg,#0f172a,#020617)]"
                aria-hidden="true"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-slate-950/10" aria-hidden="true" />

            <div className="absolute inset-x-5 bottom-5 sm:inset-x-8 sm:bottom-8">
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-slate-950/85">
                  {logoUrl ? (
                    <div
                      className="size-full bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
                      aria-label={`${tournament.game.name} logo`}
                      role="img"
                    />
                  ) : (
                    <span className="text-lg font-black text-lime-300">{tournament.game.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-300">{tournament.game.name}</p>
                <TournamentStatusBadge status={tournament.status as Exclude<TournamentStatus, "DRAFT" | "CANCELLED">} />
              </div>
              <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">{tournament.name}</h1>
              <p className="mt-3 text-sm text-slate-300 sm:text-base">Starts {formatAppDateTime(tournament.startTime)}</p>
            </div>
          </div>

          <div className="grid gap-4 border-t border-white/10 p-5 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
            <InfoItem label="Entry Fee" value={tournament.entryFee.toFixed(2) === "0.00" ? "Free" : formatMoney(tournament.entryFee)} />
            <InfoItem label="Prize Pool" value={formatMoney(tournament.prizePool)} emphasis />
            <InfoItem label="Max Participants" value={tournament.maxParticipants?.toLocaleString() ?? "Open"} />
            <InfoItem label="Format" value={formatTournamentFormat(tournament.tournamentFormat)} />
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
              <h2 className="text-xl font-black text-white">About the Tournament</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-400 sm:text-base">
                {tournament.description?.trim() || "No description provided."}
              </p>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
              <h2 className="text-xl font-black text-white">Rules</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-400 sm:text-base">
                {tournament.rules?.trim() || "Rules will be announced soon."}
              </p>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-7">
              <h2 className="text-xl font-black text-white">Tournament Info</h2>
              <dl className="mt-5 space-y-4">
                <InfoItem label="Status" value={formatStatus(tournament.status)} />
                <InfoItem label="Region" value={tournament.region} />
                <InfoItem label="Start" value={formatAppDateTime(tournament.startTime)} />
                <InfoItem label="Time Zone" value={appTimeZoneLabel()} />
              </dl>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-7">
              <h2 className="text-xl font-black text-white">Registration</h2>
              <div className="mt-5">
                <TournamentRegistration
                  tournamentId={tournament.id}
                  availability={registrationAvailability}
                  loginHref={loginHref}
                />
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-7">
              <h2 className="text-xl font-black text-white">Registration Window</h2>
              <dl className="mt-5 space-y-4">
                <InfoItem label="Registration Opens" value={registrationStart} />
                <InfoItem label="Registration Closes" value={registrationEnd} />
                <InfoItem label="Joining Window" value={`${tournament.joiningWindowMinutes} minutes`} />
              </dl>
              <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs leading-5 text-slate-500">
                Tournament joining, room credentials, and other participation details are handled in later platform phases.
              </p>
            </section>
          </aside>
        </div>
      </SectionContainer>
    </main>
  );
}
