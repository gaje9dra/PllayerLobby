"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createPrizeAction } from "./actions";

type State = { error?: string };

export function CreatePrizeForm({ tournamentId }: { tournamentId: string }) {
  const [state, action, pending] = useActionState(async (_prev: State, formData: FormData): Promise<State> => {
    try { await createPrizeAction(formData); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "Unable to add prize." }; }
  }, {});
  return <form action={action} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:grid-cols-[120px_1fr_auto]"><input type="hidden" name="tournamentId" value={tournamentId}/><label className="text-sm text-slate-400">Rank<input name="rank" required inputMode="numeric" placeholder="1" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"/></label><label className="text-sm text-slate-400">Amount<input name="amount" required inputMode="decimal" placeholder="5000.00" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"/></label><div className="flex items-end"><Button type="submit" disabled={pending}>Add Prize</Button></div>{state.error ? <p className="text-sm text-red-300 sm:col-span-3">{state.error}</p> : null}</form>;
}
