"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DEPOSIT_PRESETS, validateDepositAmount } from "@/lib/deposit-rules";

function createIdempotencyKey() {
  return `deposit-${crypto.randomUUID()}`;
}

export function AddMoneyForm() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const evaluation = validateDepositAmount(amount);
    if (!evaluation.ok) {
      setError(evaluation.message);
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/wallet/deposits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: evaluation.amount, idempotencyKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.deposit?.id) {
        setError(typeof payload?.error === "string" ? payload.error : "We could not create the deposit. Please try again.");
        setIdempotencyKey(createIdempotencyKey());
        return;
      }
      router.push(`/dashboard/wallet/deposit/${payload.deposit.id}`);
      router.refresh();
    } catch {
      setError("Network error. You can safely retry this request.");
    } finally {
      setPending(false);
    }
  }

  function choosePreset(value: string) {
    setAmount(value);
    setError("");
  }

  return <form onSubmit={submit} className="space-y-6" noValidate>
    <div>
      <label htmlFor="deposit-amount" className="text-sm font-semibold text-white">Amount to add</label>
      <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-slate-950/70 px-4 focus-within:border-lime-300/40 focus-within:ring-2 focus-within:ring-lime-300/20">
        <span aria-hidden="true" className="text-lg font-black text-slate-400">₹</span>
        <input id="deposit-amount" name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="500" aria-describedby="deposit-amount-help deposit-error" className="min-w-0 flex-1 bg-transparent px-3 py-4 text-lg font-bold text-white outline-none placeholder:text-slate-700" disabled={pending} />
      </div>
      <p id="deposit-amount-help" className="mt-2 text-xs leading-5 text-slate-500">Use INR with no more than 2 decimal places. The server validates the amount before creating a deposit.</p>
    </div>

    <div>
      <p className="text-sm font-semibold text-white">Quick amounts</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DEPOSIT_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => choosePreset(preset)} disabled={pending} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm font-bold text-slate-200 transition hover:border-lime-300/30 hover:bg-lime-300/5 hover:text-lime-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 disabled:opacity-50">₹{Number(preset).toLocaleString("en-IN")}</button>)}
      </div>
    </div>

    {error ? <p id="deposit-error" role="alert" aria-live="assertive" className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm font-semibold text-rose-200">{error}</p> : <p id="deposit-error" aria-live="polite" className="min-h-5 text-sm text-slate-500">Payment is not processed in this step. Your wallet will not be credited when the deposit is created.</p>}

    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>{pending ? "Creating deposit..." : "Create deposit"}</Button>
  </form>;
}
