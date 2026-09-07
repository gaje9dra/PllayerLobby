"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePrizeAction, updatePrizeAction } from "./actions";

export function PrizeRow({ tournamentId, prize }: { tournamentId: string; prize: { id: string; rank: number; amount: string; status: string } }) {
  const [editing, setEditing] = useState(false);
  if (!editing) return <div className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/10 p-4"><div className="font-bold text-white">#{prize.rank}</div><div className="text-white">₹{prize.amount}</div><div className="flex gap-2">{prize.status === "DRAFT" ? <><Button type="button" variant="secondary" onClick={() => setEditing(true)}>Edit</Button><form action={deletePrizeAction}><input type="hidden" name="tournamentId" value={tournamentId}/><input type="hidden" name="prizeId" value={prize.id}/><Button type="submit" variant="secondary">Remove</Button></form></> : <span className="rounded-full bg-lime-300/10 px-3 py-1 text-xs font-bold text-lime-200">FINALIZED</span>}</div></div>;
  return <form action={updatePrizeAction} className="grid gap-3 rounded-xl border border-lime-300/20 p-4 sm:grid-cols-[100px_minmax(0,1fr)_auto]"><input type="hidden" name="tournamentId" value={tournamentId}/><input type="hidden" name="prizeId" value={prize.id}/><label className="text-sm text-slate-400">Rank<input name="rank" required defaultValue={prize.rank} inputMode="numeric" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"/></label><label className="text-sm text-slate-400">Amount<input name="amount" required defaultValue={prize.amount} inputMode="decimal" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"/></label><div className="flex items-end gap-2"><Button type="submit">Save</Button><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div></form>;
}
