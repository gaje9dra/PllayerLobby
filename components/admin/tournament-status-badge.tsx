import type { TournamentStatus } from "@/app/generated/prisma/client";

const styles: Record<TournamentStatus, string> = {
  DRAFT: "border-slate-400/20 bg-slate-400/10 text-slate-300",
  UPCOMING: "border-sky-300/20 bg-sky-300/10 text-sky-200",
  REGISTRATION_OPEN: "border-lime-300/20 bg-lime-300/10 text-lime-200",
  REGISTRATION_CLOSED: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  LIVE: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  COMPLETED: "border-violet-300/20 bg-violet-300/10 text-violet-200",
  CANCELLED: "border-slate-500/20 bg-slate-500/10 text-slate-400",
};

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${styles[status]}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
