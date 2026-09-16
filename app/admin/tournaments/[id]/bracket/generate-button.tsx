"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateBracketAction } from "./actions";

export function GenerateBracketButton({ tournamentId, participantCount }: { tournamentId: string; participantCount: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function generate() {
    if (!window.confirm(`Generate bracket for ${participantCount} confirmed participant${participantCount === 1 ? "" : "s"}? This assignment will remain fixed until an explicitly authorized regeneration is implemented.`)) return;
    startTransition(async () => {
      try {
        await generateBracketAction(tournamentId);
        router.refresh();
      } catch (error) {
        window.alert(error instanceof Error ? error.message.replaceAll("_", " ") : "Bracket generation failed.");
      }
    });
  }

  return (
    <button type="button" onClick={generate} disabled={pending} className="rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Generating…" : "Generate Bracket"}
    </button>
  );
}
