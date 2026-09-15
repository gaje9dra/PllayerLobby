"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PayUWalletCheckout({ depositId, hasPhone }: { depositId: string; hasPhone: boolean }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setError("");
    const normalizedPhone = phone.replace(/\s+/g, "");
    if (!hasPhone && !/^[6-9][0-9]{9}$/.test(normalizedPhone)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/wallet/deposits/${depositId}/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(hasPhone ? {} : { phone: normalizedPhone }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.checkoutUrl || !data?.fields) {
        setError(typeof data?.error === "string" ? data.error : "Payment is temporarily unavailable. Please try again.");
        return;
      }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.checkoutUrl;
      form.style.display = "none";
      Object.entries(data.fields as Record<string, string>).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch {
      setError("Network error. Your deposit remains pending and your wallet has not been credited.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="mt-7 border-t border-white/5 pt-6">
    {!hasPhone ? <div className="mb-4"><label htmlFor="payu-phone" className="text-xs font-bold uppercase tracking-wide text-slate-500">Mobile number</label><input id="payu-phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile number" disabled={loading} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-lime-300/40 focus:ring-2 focus:ring-lime-300/20" /></div> : null}
    {error ? <p role="alert" aria-live="assertive" className="mb-4 rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm font-semibold text-rose-200">{error}</p> : null}
    <Button type="button" onClick={startCheckout} disabled={loading}>{loading ? "Opening PayU..." : "Continue to PayU"}</Button>
    <p className="mt-3 text-xs leading-5 text-slate-500">You will be redirected to PayU to complete payment. PlayerLobby credits your wallet only after server-side verification.</p>
  </div>;
}
