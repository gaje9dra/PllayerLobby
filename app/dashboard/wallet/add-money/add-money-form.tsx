"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEPOSIT_PRESETS, validateDepositAmount } from "@/lib/deposit-rules";

function createIdempotencyKey() {
  return `deposit-${crypto.randomUUID()}`;
}

function redirectToPayU(url: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.style.display = "none";
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

export function AddMoneyForm() {
  const [amount, setAmount] = useState("");
  const [idempotencyKey] = useState(createIdempotencyKey);
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
      if (!response.ok || typeof payload?.checkout?.url !== "string" || !payload?.checkout?.fields) {
        setError(typeof payload?.error === "string" ? payload.error : "We could not open PayU. Your deposit remains pending; please retry.");
        return;
      }
      // POST directly to PayU. The PlayerLobby deposit status page is skipped.
      redirectToPayU(payload.checkout.url, payload.checkout.fields as Record<string, string>);
    } catch {
      setError("Network error. Your deposit may still be pending. Please retry.");
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
      <p id="deposit-amount-help" className="mt-2 text-xs leading-5 text-slate-500">Use INR with no more than 2 decimal places. The server validates the amount before creating the payment.</p>
    </div>
    <div>
      <p className="text-sm font-semibold text-white">Quick amounts</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DEPOSIT_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => choosePreset(preset)} disabled={pending} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm font-bold text-slate-200 transition hover:border-lime-300/30 hover:bg-lime-300/5 hover:text-lime-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 disabled:opacity-50">₹{Number(preset).toLocaleString("en-IN")}</button>)}
      </div>
    </div>
    {error ? <p id="deposit-error" role="alert" aria-live="assertive" className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm font-semibold text-rose-200">{error}</p> : <p id="deposit-error" aria-live="polite" className="min-h-5 text-sm text-slate-500">After you create the deposit, you will be redirected straight to PayU.</p>}
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>{pending ? "Redirecting to PayU..." : "Create deposit & pay"}</Button>
  </form>;
}
