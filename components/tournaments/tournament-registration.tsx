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
}: {
  tournamentId: string;
  availability: RegistrationAvailability;
  loginHref: string;
  initialPhone: string | null;
  existingRegistrationId: string | null;
}) {
  const [state, action, pending] = useActionState(registerForTournament, INITIAL_STATE);

  if (state.ok) {
    if (state.paymentRequired && state.registrationId) {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4" role="status">
            <p className="text-sm font-bold text-amber-200">Registration created — payment required</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/70">Your registration is pending until the payment is verified. No payment has been confirmed yet.</p>
          </div>
          <TournamentPayment registrationId={state.registrationId} initialPhone={initialPhone} />
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4" role="status">
        <p className="text-sm font-bold text-lime-200">Registration Confirmed</p>
        <p className="mt-1 text-xs leading-5 text-lime-100/70">You are registered for this free tournament.</p>
      </div>
    );
  }

  if (availability === "PAYMENT_PENDING" && existingRegistrationId) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4" role="status">
          <p className="text-sm font-bold text-amber-200">Payment Pending</p>
          <p className="mt-1 text-xs leading-5 text-amber-100/70">This paid registration is waiting for payment. You can continue to the hosted PayU checkout.</p>
        </div>
        <TournamentPayment registrationId={existingRegistrationId} initialPhone={initialPhone} />
      </div>
    );
  }

  if (availability === "LOGIN") {
    return <Button href={loginHref} className="w-full">Login to Register</Button>;
  }

  if (availability !== "REGISTER") {
    const message = availabilityMessages[availability as Exclude<RegistrationAvailability, "LOGIN" | "REGISTER" | "PAYMENT_PENDING">];
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4" role="status">
        <p className="text-sm font-bold text-white">{message}</p>
        {state.message ? <p className="mt-1 text-xs leading-5 text-slate-400">{state.message}</p> : null}
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Registering..." : "Register"}
      </Button>
      {state.message ? <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs leading-5 text-red-200" role="alert">{state.message}</p> : null}
    </form>
  );
}
