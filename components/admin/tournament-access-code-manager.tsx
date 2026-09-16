"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type AccessCodeData = { status: "ACTIVE" | "REVOKED" | "EXPIRED"; code?: string };

export function TournamentAccessCodeManager({ tournamentId }: { tournamentId: string }) {
  const [data, setData] = useState<AccessCodeData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load(reveal = false) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/access-code${reveal ? "?reveal=1" : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.message || "Unable to load access code.");
      setData(body.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load access code.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(false); }, [tournamentId]);

  async function mutate(path: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/access-code${path}`, { method: "POST", cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.message || "Unable to update access code.");
      if (typeof body.code === "string") setData({ status: "ACTIVE", code: body.code });
      else await load(false);
      setMessage(path.includes("revoke") ? "Access code revoked." : "Access code updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update access code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Tournament security</p>
          <h2 className="mt-2 text-lg font-bold text-white">Tournament Access Code</h2>
          <p className="mt-1 text-sm text-slate-400">Private credential for eligible participants. Phase 9.9 controls when it can be used.</p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-300">{data?.status ?? "Loading"}</span>
      </div>
      <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-4 font-mono text-lg tracking-[0.18em] text-white">
        {data?.code ?? "••••-••••-••••"}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={() => void load(!data?.code)} disabled={busy || data?.status !== "ACTIVE"}>{data?.code ? "Hide Code" : "Show Code"}</Button>
        <Button type="button" onClick={() => void mutate("")} disabled={busy}>Generate / Use Existing</Button>
        <Button type="button" variant="secondary" onClick={() => void mutate("/regenerate", "Regenerate the tournament access code? The previous code will become invalid immediately.")} disabled={busy}>Regenerate</Button>
        <Button type="button" variant="secondary" onClick={() => void mutate("/revoke", "Revoke the tournament access code? It will no longer authorize access.")} disabled={busy || data?.status !== "ACTIVE"}>Revoke</Button>
      </div>
      {message ? <p role="status" className="mt-4 text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}
