"use client";

import { useActionState } from "react";
import { registerForTournament, type RegistrationActionState } from "@/app/tournaments/actions";
import { Button } from "@/components/ui/button";

export type RegistrationAvailability =
  | "LOGIN"
  | "REGISTER"
  | "ALREADY_REGISTERED"
  | "TOURNAMENT_FULL"
  | "REGISTRATION_CLOSED"
  | "REGISTRATION_NOT_STARTED"
  | "UNAVAILABLE"
  | "COMPLETED";

const INITIAL_STATE: RegistrationActionState = { ok: false };

const availabilityMessages: Record<Exclude<RegistrationAvailability, "LOGIN" | "REGISTER">, string> = {
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
}: {
  tournamentId: string;
  availability: RegistrationAvailability;
  loginHref: string;
}) {
  const [state, action, pending] = useActionState(registerForTournament, INITIAL_STATE);

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4" role="status">
        <p className="text-sm font-bold text-lime-200">
          {state.paymentRequired ? "Registration created. Payment integration will be available in the next step." : "Registration Confirmed"}
        </p>
        <p className="mt-1 text-xs leading-5 text-lime-100/70">
          {state.paymentRequired
            ? "Your registration is pending payment verification. No payment has been processed yet."
            : "You are registered for this tournament."}
        </p>
      </div>
    );
  }

  if (availability === "LOGIN") {
    return (
      <Button href={loginHref} className="w-full">
        Login to Register
      </Button>
    );
  }

  if (availability !== "REGISTER") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4" role="status">
        <p className="text-sm font-bold text-white">{availabilityMessages[availability]}</p>
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
      {state.message ? (
        <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs leading-5 text-red-200" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
