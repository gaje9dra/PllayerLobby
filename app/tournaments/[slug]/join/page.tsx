import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SectionContainer } from "@/components/ui/section-container";
import { Button } from "@/components/ui/button";
import { JoinRoom } from "@/components/tournaments/join-room";
import { getJoiningWindowStart } from "@/lib/tournament-room-rules";
import { formatAppDateTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function TournamentJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tournament = await prisma.tournament.findFirst({ where: { slug, game: { isActive: true } }, select: { id: true, name: true, slug: true, status: true, startTime: true, joiningWindowMinutes: true } });
  if (!tournament) notFound();

  const user = await getCurrentUser();
  const registration = user ? await prisma.registration.findUnique({ where: { userId_tournamentId: { userId: user.id, tournamentId: tournament.id } }, select: { id: true, status: true } }) : null;
  const now = new Date();
  const joiningStart = getJoiningWindowStart(tournament.startTime, tournament.joiningWindowMinutes);

  let state: "LOGIN" | "NOT_REGISTERED" | "PENDING" | "CANCELLED" | "COMPLETED" | "NOT_OPEN" | "READY" = "NOT_OPEN";
  if (!user) state = "LOGIN";
  else if (tournament.status === TournamentStatus.CANCELLED) state = "CANCELLED";
  else if (tournament.status === TournamentStatus.COMPLETED) state = "COMPLETED";
  else if (!registration) state = "NOT_REGISTERED";
  else if (registration.status !== RegistrationStatus.CONFIRMED) state = "PENDING";
  else if (now < joiningStart || now >= tournament.startTime) state = "NOT_OPEN";
  else state = "READY";

  return (
    <SectionContainer className="py-12 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Link href={`/tournaments/${tournament.slug}`} className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Back to tournament</Link>
        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.025] p-6 shadow-2xl shadow-black/20 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Tournament joining</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{tournament.name}</h1>
          {state === "LOGIN" ? <Message title="Login to continue" text="Sign in with Google to access tournament joining details." action={<Button href={`/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournament.slug}/join`)}`}>Login to Continue</Button>} /> : null}
          {state === "NOT_REGISTERED" ? <Message title="You are not registered for this tournament" text="Register for this tournament before attempting to join." action={<Button href={`/tournaments/${tournament.slug}`}>View Tournament</Button>} /> : null}
          {state === "PENDING" ? <Message title="Your registration is not confirmed yet" text="Joining details become available only after your registration is confirmed." /> : null}
          {state === "CANCELLED" ? <Message title="This tournament has been cancelled" text="Tournament joining is disabled." /> : null}
          {state === "COMPLETED" ? <Message title="Tournament joining is closed" text="This tournament has already been completed." /> : null}
          {state === "NOT_OPEN" ? <Message title="Joining information will become available shortly before the tournament" text={`Joining opens ${formatAppDateTime(joiningStart)} and closes at tournament start (${formatAppDateTime(tournament.startTime)}).`} /> : null}
          {state === "READY" && registration ? <JoinRoom tournamentId={tournament.id} registrationId={registration.id} /> : null}
        </section>
      </div>
    </SectionContainer>
  );
}

function Message({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="mt-7 rounded-2xl border border-white/10 bg-slate-950/40 p-5"><h2 className="text-base font-bold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>{action ? <div className="mt-5">{action}</div> : null}</div>;
}
