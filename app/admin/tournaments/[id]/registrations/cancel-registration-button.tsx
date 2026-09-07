"use client";

import { useActionState } from "react";
import {
  cancelRegistration,
  type CancelRegistrationState,
} from "@/app/admin/tournaments/[id]/registrations/actions";

const initialState: CancelRegistrationState = { ok: false };

export function CancelRegistrationButton({
  tournamentId,
  registrationId,
  disabled = false,
}: {
  tournamentId: string;
  registrationId: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(cancelRegistration, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Cancel this registration?\n\nThe registration will remain in the database, payment history will be preserved, and any registration code will be revoked. No refund will be processed by this action.",
          )
        ) {
          event.preventDefault();
        }
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-400/10 px-5 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Cancelling..." : "Cancel Registration"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs font-medium text-rose-300">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
