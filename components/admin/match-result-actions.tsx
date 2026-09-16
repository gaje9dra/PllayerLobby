"use client";

import { useState } from "react";

export function MatchResultActions({ matchId, resultId, status }: { matchId: string; resultId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function act(action: "verify" | "reject" | "dispute") {
    setBusy(true);
    setMessage("");
    try {
      const reason = action === "reject" ? window.prompt("Rejection reason:") : undefined;
      if (action === "reject" && reason === null) return;
      if (action === "verify" && !window.confirm("Verify this result and advance the winner to the next round?")) return;
      const response = await fetch(`/api/admin/matches/${matchId}/result/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, ...(reason ? { reason } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Operation failed");
      setMessage(action === "verify" ? "Verified and bracket updated." : action === "reject" ? "Result rejected." : "Result marked disputed.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!["PENDING", "DISPUTED"].includes(status)) return null;
  return <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => act("verify")} className="rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-50">Verify</button><button disabled={busy} onClick={() => act("reject")} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Reject</button><button disabled={busy} onClick={() => act("dispute")} className="rounded-lg border border-amber-300/20 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50">Dispute</button>{message ? <span className="basis-full text-xs text-slate-400">{message}</span> : null}</div>;
}
