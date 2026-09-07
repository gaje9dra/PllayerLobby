import Link from "next/link";
import { notFound } from "next/navigation";
import { RoomForm } from "@/app/admin/tournaments/[id]/room/room-form";
import { RoomDisableForm } from "@/app/admin/tournaments/[id]/room/room-disable-form";
import { SectionContainer } from "@/components/ui/section-container";
import { requireAdmin } from "@/lib/auth";
import { getAdminTournamentRoom } from "@/lib/tournament-room";
import { prisma } from "@/lib/prisma";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { formatAppDateTime } from "@/lib/timezone";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminTournamentRoomPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true, slug: true, status: true, startTime: true, joiningWindowMinutes: true } });
  if (!tournament) notFound();
  const room = await getAdminTournamentRoom(id);
  const locked = tournament.status === TournamentStatus.COMPLETED || tournament.status === TournamentStatus.CANCELLED;

  return (
    <SectionContainer className="py-10 sm:py-14">
      <Link href={`/admin/tournaments/${id}`} className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Back to tournament</Link>
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Administration / Room</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{tournament.name}</h1>
        <p className="mt-2 text-sm text-slate-500">Prepare private joining credentials. Only authenticated active administrators can manage this page.</p>
      </div>

      <div className="mt-7 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-5 text-sm leading-6 text-amber-100/70">
        Room credentials are encrypted at rest and are never included in public tournament data, metadata, URLs, or logs. Publishing makes them available only during the server-controlled joining window to the confirmed registration owner who supplies the matching registration code.
      </div>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Room credentials</h2>
            <p className="mt-1 text-sm text-slate-500">Tournament starts {formatAppDateTime(tournament.startTime)}. Joining opens {tournament.joiningWindowMinutes} minutes before start.</p>
          </div>
          {room?.publishedAt && !room.revokedAt ? <span className="w-fit rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-bold text-lime-300">Published</span> : <span className="w-fit rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-400">Not published</span>}
        </div>
        <div className="mt-7">
          <RoomForm tournamentId={id} room={room} disabled={locked} />
        </div>
        {room ? (
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs text-slate-600">Last updated {formatAppDateTime(room.updatedAt)}</p>
            <RoomDisableForm tournamentId={id} disabled={locked || !!room.revokedAt} />
          </div>
        ) : null}
      </section>

      {locked ? <p className="mt-4 text-xs text-slate-600">Room credentials cannot be published or updated for a completed or cancelled tournament.</p> : null}
    </SectionContainer>
  );
}
