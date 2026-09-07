import Link from "next/link";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { TournamentStatusBadge } from "@/components/tournaments/tournament-status-badge";
import { formatAppDateTime } from "@/lib/timezone";

type TournamentCardTournament = {
  name: string;
  slug: string;
  bannerUrl: string | null;
  startTime: Date;
  registrationStartTime: Date | null;
  registrationEndTime: Date | null;
  entryFee: { toFixed: (digits?: number) => string };
  prizePool: { toFixed: (digits?: number) => string };
  maxParticipants: number | null;
  tournamentFormat: string;
  region: string;
  status: TournamentStatus;
  game: { name: string; logoUrl: string | null };
};

function safeImageUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatFormat(value: string) {
  return value.replaceAll("_", " ");
}

function getDisplayStatus(tournament: TournamentCardTournament, now: Date): Exclude<TournamentStatus, "DRAFT" | "CANCELLED"> {
  if (tournament.status === TournamentStatus.REGISTRATION_OPEN) {
    if (tournament.registrationStartTime && now < tournament.registrationStartTime) return TournamentStatus.UPCOMING;
    if (!tournament.registrationEndTime || now >= tournament.registrationEndTime) return TournamentStatus.REGISTRATION_CLOSED;
  }

  return tournament.status as Exclude<TournamentStatus, "DRAFT" | "CANCELLED">;
}

export function TournamentCard({ tournament }: { tournament: TournamentCardTournament }) {
  const bannerUrl = safeImageUrl(tournament.bannerUrl);
  const logoUrl = safeImageUrl(tournament.game.logoUrl);
  const displayStatus = getDisplayStatus(tournament, new Date());

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] transition hover:-translate-y-0.5 hover:border-lime-300/20 hover:bg-white/[0.04]">
      <Link href={`/tournaments/${encodeURIComponent(tournament.slug)}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 focus-visible:ring-inset">
        <div className="relative aspect-[16/8] overflow-hidden bg-slate-900">
          {bannerUrl ? (
            <div className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-105" style={{ backgroundImage: `url(${JSON.stringify(bannerUrl)})` }} aria-hidden="true" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(163,230,53,0.16),transparent_35%),linear-gradient(135deg,#0f172a,#020617)]" aria-hidden="true" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-slate-950/80 shadow-lg">
                {logoUrl ? <div className="size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }} aria-label={`${tournament.game.name} logo`} role="img" /> : <span className="text-sm font-black text-lime-300">{tournament.game.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-300">{tournament.game.name}</p>
                <h2 className="mt-0.5 line-clamp-2 text-lg font-black leading-tight text-white sm:text-xl">{tournament.name}</h2>
              </div>
            </div>
            <TournamentStatusBadge status={displayStatus} />
          </div>
        </div>

        <div className="p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-600">Starts</dt>
              <dd className="mt-1 font-semibold text-slate-200">{formatAppDateTime(tournament.startTime)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Entry fee</dt>
              <dd className="mt-1 font-semibold text-white">{tournament.entryFee.toFixed(2) === "0.00" ? "Free" : `₹${tournament.entryFee.toFixed(2)}`}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Prize pool</dt>
              <dd className="mt-1 font-semibold text-lime-200">₹{tournament.prizePool.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Participants</dt>
              <dd className="mt-1 font-semibold text-slate-200">{tournament.maxParticipants?.toLocaleString() ?? "Open"}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-slate-500"><span>{formatFormat(tournament.tournamentFormat)}</span><span>{tournament.region}</span><span className="font-semibold text-lime-300 transition group-hover:text-lime-200">View tournament →</span></div>
        </div>
      </Link>
    </article>
  );
}
