"use client";

import { useEffect, useMemo, useState } from "react";
import { validateGameSpecificConfig, type GameConfigCode, type GameSpecificConfig } from "@/lib/game-specific-config";

const defaults: Record<GameConfigCode, GameSpecificConfig> = {
  VALORANT: { version: 1, format: "5V5", teamSize: 5, gameMode: "COMPETITIVE", map: "ANY", rounds: 1, scoring: { win: 3, loss: 0 } },
  STUMBLE_GUYS: { version: 1, format: "SOLO", participantStructure: "INDIVIDUAL", rounds: 3, gameMode: "RACE", scoring: { first: 10, second: 7, third: 5 } },
};

type Props = { gameCode?: string; initialConfig?: unknown };

export function GameSpecificConfigFields({ gameCode, initialConfig }: Props) {
  const supported = gameCode === "VALORANT" || gameCode === "STUMBLE_GUYS";
  const code = supported ? gameCode as GameConfigCode : null;
  const initial = useMemo(() => {
    if (!code) return null;
    const result = validateGameSpecificConfig(code, initialConfig ?? defaults[code]);
    return result.ok ? result.config : defaults[code];
  }, [code, initialConfig]);
  const [config, setConfig] = useState<GameSpecificConfig | null>(initial);

  useEffect(() => setConfig(initial), [initial]);

  if (!code || !config) {
    return <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">Game-specific settings</h2><p className="mt-2 text-sm text-slate-500">This game does not have a dedicated configuration schema yet. Core tournament settings remain available.</p><input type="hidden" name="gameConfig" value="" /></section>;
  }

  const set = (patch: Partial<GameSpecificConfig>) => setConfig((current) => current ? { ...current, ...patch } as GameSpecificConfig : current);
  const error = validateGameSpecificConfig(code, config);

  return (
    <section className="rounded-2xl border border-lime-300/10 bg-lime-300/[0.02] p-5 sm:p-7">
      <div><h2 className="text-lg font-bold text-white">{code === "VALORANT" ? "Valorant settings" : "Stumble Guys settings"}</h2><p className="mt-1 text-sm text-slate-500">Only settings relevant to the selected game are shown. These settings never contain entry fees or prize pools.</p></div>
      <input type="hidden" name="gameConfig" value={JSON.stringify(config)} />
      {!error.ok && error.errors.form ? <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">{error.errors.form}</p> : null}
      {code === "VALORANT" ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-semibold text-white">Tournament Format<select value={config.format} onChange={(e) => { const format = e.target.value as typeof config.format; const teamSize = format === "5V5" ? 5 : format === "3V3" ? 3 : 1; set({ format, teamSize }); }} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"><option value="5V5">5v5</option><option value="3V3">3v3</option><option value="1V1">1v1</option></select></label>
          <label className="text-sm font-semibold text-white">Team Size<select value={config.teamSize} onChange={(e) => set({ teamSize: Number(e.target.value) as 1 | 3 | 5 })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"><option value="5">5</option><option value="3">3</option><option value="1">1</option></select></label>
          <label className="text-sm font-semibold text-white">Game Mode<select value={config.gameMode} onChange={(e) => set({ gameMode: e.target.value as typeof config.gameMode })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"><option value="COMPETITIVE">Competitive</option><option value="UNRATED">Unrated</option><option value="SWIFTPLAY">Swiftplay</option><option value="CUSTOM">Custom</option></select></label>
          <label className="text-sm font-semibold text-white">Map<select value={config.map} onChange={(e) => set({ map: e.target.value as typeof config.map })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"><option value="ANY">Any</option><option value="ASCENT">Ascent</option><option value="BIND">Bind</option><option value="HAVEN">Haven</option><option value="LOTUS">Lotus</option><option value="SUNSET">Sunset</option><option value="ICEBOX">Icebox</option><option value="PEARL">Pearl</option><option value="SPLIT">Split</option><option value="BREEZE">Breeze</option><option value="FRACTURE">Fracture</option></select></label>
          <label className="text-sm font-semibold text-white">Rounds<input type="number" min="1" max="99" value={config.rounds} onChange={(e) => set({ rounds: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white" /></label>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-semibold text-white">Tournament Format<select value={config.format} onChange={(e) => set({ format: e.target.value as typeof config.format })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"><option value="SOLO">Solo</option><option value="DUO">Duo</option><option value="SQUAD">Squad</option></select></label>
          <label className="text-sm font-semibold text-white">Participant Structure<select value={config.participantStructure} onChange={(e) => set({ participantStructure: e.target.value as typeof config.participantStructure })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"><option value="INDIVIDUAL">Individual</option><option value="TEAM">Team</option></select></label>
          <label className="text-sm font-semibold text-white">Rounds<input type="number" min="1" max="10" value={config.rounds} onChange={(e) => set({ rounds: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white" /></label>
          <label className="text-sm font-semibold text-white">Game Mode<select value={config.gameMode} onChange={(e) => set({ gameMode: e.target.value as typeof config.gameMode })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"><option value="RACE">Race</option><option value="ELIMINATION">Elimination</option><option value="CUSTOM">Custom</option></select></label>
        </div>
      )}
    </section>
  );
}
