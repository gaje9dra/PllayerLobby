"use client";

import { useActionState, useEffect, useRef } from "react";
import { initiateTournamentPayment, type PaymentActionState } from "@/app/tournaments/payment-actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: PaymentActionState = { ok: false };

export function TournamentPayment({ registrationId }: { registrationId: string }) {
  const [state, action, pending] = useActionState(initiateTournamentPayment, INITIAL_STATE);
  const checkoutFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      checkoutFormRef.current?.submit();
    }
  }, [state]);

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4" role="status">
        <p className="text-sm font-bold text-lime-200">Redirecting to PayU...</p>
        <p className="mt-1 text-xs leading-5 text-lime-100/70">Your payment amount was calculated securely from the tournament database.</p>
        <form ref={checkoutFormRef} method="POST" action={state.checkoutUrl} className="hidden">
          {Object.entries(state.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </form>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Preparing Payment..." : "Proceed to Payment"}
      </Button>
      {state.message ? (
        <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs leading-5 text-red-200" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
