"use client";

import { useActionState } from "react";
import { registerForTournament, type RegistrationActionState } from "@/app/tournaments/actions";
import { TournamentPayment } from "@/components/tournaments/tournament-payment";
import { Button } from "@/components/ui/button";

export type RegistrationAvailability =
  | "LOGIN"
  | "REGISTER"
  | "PAYMENT_PENDING"
  | "ALREADY_REGISTERED"
  | "TOURNAMENT_FULL"
  | "REGISTRATION_CLOSED"
  | "REGISTRATION_NOT_STARTED"
  | "UNAVAILABLE"
  | "COMPLETED";

const INITIAL_STATE: RegistrationActionState = { ok: false };

const availabilityMessages: Record<Exclude<RegistrationAvailability, "LOGIN" | "REGISTER" | "PAYMENT_PENDING">, string> = {
  ALREADY_REGISTERED: "You already have an active registration for this tournament.",
  TOURNAMENT_FULL: "This tournament is currently full.",
  REGISTRATION_CLOSED: "Registration is currently closed.",
  REGISTRATION_NOT_STARTED: "Registration has not started yet.",
  UNAVAILABLE: "Your account is not currently eligible to register.",
  COMPLETED: "This tournament is completed.",
};

export function TournamentRegistration({
  tournamentId,
  availability,
  loginHref,
  initialPhone,
  existingRegistrationId,
  walletBalance,
  entryFee,
  tournamentName,
  gameName,
  tournamentStart,
}: {
  tournamentId: string;
  availability: RegistrationAvailability;
  loginHref: string;
  initialPhone: string | null;
  existingRegistrationId: string | null;
  walletBalance: string | null;
  entryFee: string;
  tournamentName: string;
  gameName: string;
  tournamentStart: string;
}) {
  const [state, action, pending] = useActionState(registerForTournament, INITIAL_STATE);
  const displayedBalance = state.ok ? state.walletBalance : walletBalance;

  if (state.ok) {
    const paid = state.entryFee !== "0.00";
    return (
      <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4" role="status">
        <p className="text-sm font-bold text-lime-200">Registration Confirmed</p>
        <dl className="mt-3 grid gap-2 text-xs text-lime-100/80">
          <div className="flex justify-between gap-4"><dt>Tournament</dt><dd className="font-semibold text-white">{tournamentName}</dd></div>
          <div className="flex justify-between gap-4"><dt>Game</dt><dd className="font-semibold text-white">{gameName}</dd></div>
          <div className="flex justify-between gap-4"><dt>Entry fee</dt><dd className="font-semibold text-white">{paid ? `₹${state.entryFee}` : "Free"}</dd></div>
          <div className="flex justify-between gap-4"><dt>Reference</dt><dd className="font-mono font-semibold text-white">{state.registrationReference}</dd></div>
          <div className="flex justify-between gap-4"><dt>Tournament date</dt><dd className="font-semibold text-white">{tournamentStart}</dd></div>
          <div className="flex justify-between gap-4"><dt>Participant status</dt><dd className="font-semibold text-white">{state.registrationStatus}</dd></div>
        </dl>
        {paid ? <p className="mt-3 text-xs font-semibold text-white">Remaining wallet balance: ₹{state.walletBalance}</p> : null}
        <p className="mt-3 text-[11px] leading-5 text-slate-500">Keep your registration reference for support. Tournament access credentials are provided separately when that feature is enabled.</p>
      </div>
    );
  }

  if (availability === "PAYMENT_PENDING" && existingRegistrationId) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4" role="status">
          <p className="text-sm font-bold text-amber-200">Payment Pending</p>
          <p className="mt-1 text-xs leading-5 text-amber-100/70">This older paid registration is waiting for its existing payment flow to complete.</p>
        </div>
        <TournamentPayment registrationId={existingRegistrationId} initialPhone={initialPhone} />
      </div>
    );
  }

  if (availability === "LOGIN") return <Button href={loginHref} className="w-full">Login to Register</Button>;

  if (availability !== "REGISTER") {
    const message = availabilityMessages[availability as Exclude<RegistrationAvailability, "LOGIN" | "REGISTER" | "PAYMENT_PENDING">];
    return <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4" role="status"><p className="text-sm font-bold text-white">{message}</p></div>;
  }

  const isFree = entryFee === "0.00";
  return (
    <div>
      {!isFree ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Wallet balance</p><p className="mt-1 text-lg font-black text-white">₹{displayedBalance ?? "0.00"}</p></div>
            <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Entry fee</p><p className="mt-1 text-lg font-black text-lime-200">₹{entryFee}</p></div>
          </div>
        </div>
      ) : null}
      <form action={action}>
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>{pending ? "Joining..." : isFree ? "Join Free Tournament" : `Join for ₹${entryFee}`}</Button>
        {state.message ? <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-3 text-xs leading-5 text-red-200" role="alert"><p>{state.message}</p>{state.code === "INSUFFICIENT_BALANCE" ? <Button href="/dashboard/wallet/add-money" variant="secondary" className="mt-3 w-full">Add Money</Button> : null}</div> : null}
      </form>
    </div>
  );
}
