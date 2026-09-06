"use client";

import { useActionState, useState } from "react";
import { createTournament, type CreateTournamentState } from "@/app/admin/tournaments/actions";
import { slugify, type TournamentFieldErrors } from "@/lib/tournament-validation";
import { appTimeZoneLabel } from "@/lib/timezone";

type Game = { id: string; name: string };
const formats = ["SOLO", "DUO", "SQUAD", "TEAM"] as const;
const initialState: CreateTournamentState = { ok: false, errors: {} };

function FieldError({ error }: { error?: string }) {
  return error ? <p className="mt-2 text-xs font-medium text-rose-300">{error}</p> : null;
}

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return <label className="text-sm font-semibold text-white">{children} {required ? <span className="text-lime-300">*</span> : null}</label>;
}

function inputClasses(error?: string) {
  return `mt-2 w-full rounded-xl border bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-lime-300/60 focus:ring-2 focus:ring-lime-300/10 ${error ? "border-rose-400/60" : "border-white/10"}`;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p><div className="mt-6 grid gap-5">{children}</div></section>;
}

export function TournamentForm({ games }: { games: Game[] }) {
  const [state, formAction, pending] = useActionState(createTournament, initialState);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const errors: TournamentFieldErrors = state.errors;

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  return (
    <form action={formAction} className="grid gap-6" noValidate>
      {errors.form ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errors.form}</div> : null}

      <Section title="Tournament identity" description="Define the game, name, URL slug, and public-facing content.">
        <div><Label required>Game</Label><select name="gameId" defaultValue="" className={inputClasses(errors.gameId)}><option value="" disabled>Select a game</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select><FieldError error={errors.gameId} /></div>
        <div><Label required>Tournament Name</Label><input name="name" value={name} onChange={(event) => handleNameChange(event.target.value)} className={inputClasses(errors.name)} placeholder="Valorant Weekend Cup" maxLength={120} /><FieldError error={errors.name} /></div>
        <div><Label required>Slug</Label><input name="slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} className={inputClasses(errors.slug)} placeholder="valorant-weekend-cup" maxLength={120} /><p className="mt-2 text-xs text-slate-600">Generated from the tournament name. You can edit it manually.</p><FieldError error={errors.slug} /></div>
        <div><Label>Description</Label><textarea name="description" className={`${inputClasses(errors.description)} min-h-28 resize-y`} placeholder="Describe this tournament..." maxLength={5000} /><FieldError error={errors.description} /></div>
        <div><Label>Rules</Label><textarea name="rules" className={`${inputClasses(errors.rules)} min-h-40 resize-y`} placeholder="Tournament rules and important instructions..." maxLength={10000} /><FieldError error={errors.rules} /></div>
        <div><Label>Banner URL</Label><input name="bannerUrl" type="url" className={inputClasses(errors.bannerUrl)} placeholder="https://example.com/banner.jpg" /><FieldError error={errors.bannerUrl} /></div>
      </Section>

      <Section title="Schedule" description={`All date/time fields use the platform timezone: ${appTimeZoneLabel()}. Stored timestamps are timezone-aware.`}>
        <div><Label required>Tournament Start</Label><input name="startTime" type="datetime-local" className={inputClasses(errors.startTime)} /><FieldError error={errors.startTime} /></div>
        <div><Label required>Registration Start</Label><input name="registrationStartTime" type="datetime-local" className={inputClasses(errors.registrationStartTime)} /><FieldError error={errors.registrationStartTime} /></div>
        <div><Label required>Registration End</Label><input name="registrationEndTime" type="datetime-local" className={inputClasses(errors.registrationEndTime)} /><FieldError error={errors.registrationEndTime} /></div>
      </Section>

      <Section title="Tournament configuration" description="Set the commercial and competitive parameters. Payment processing is not included in this phase.">
        <div className="grid gap-5 sm:grid-cols-2"><div><Label required>Entry Fee</Label><input name="entryFee" type="text" inputMode="decimal" defaultValue="0" className={inputClasses(errors.entryFee)} placeholder="0.00" /><FieldError error={errors.entryFee} /></div><div><Label required>Prize Pool</Label><input name="prizePool" type="text" inputMode="decimal" defaultValue="0" className={inputClasses(errors.prizePool)} placeholder="0.00" /><FieldError error={errors.prizePool} /></div></div>
        <div className="grid gap-5 sm:grid-cols-2"><div><Label required>Maximum Participants</Label><input name="maxParticipants" type="number" min="1" max="10000" defaultValue="100" className={inputClasses(errors.maxParticipants)} /><FieldError error={errors.maxParticipants} /></div><div><Label required>Tournament Format</Label><select name="tournamentFormat" defaultValue="" className={inputClasses(errors.tournamentFormat)}><option value="" disabled>Select format</option>{formats.map((format) => <option key={format} value={format}>{format}</option>)}</select><FieldError error={errors.tournamentFormat} /></div></div>
        <div className="grid gap-5 sm:grid-cols-2"><div><Label required>Region / Server</Label><input name="region" className={inputClasses(errors.region)} placeholder="India" maxLength={100} /><FieldError error={errors.region} /></div><div><Label required>Joining Window (minutes)</Label><input name="joiningWindowMinutes" type="number" min="1" max="120" defaultValue="10" className={inputClasses(errors.joiningWindowMinutes)} /><p className="mt-2 text-xs text-slate-600">Configuration only. Room access is implemented later.</p><FieldError error={errors.joiningWindowMinutes} /></div></div>
      </Section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><a href="/admin/tournaments" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white">Cancel</a><button type="submit" disabled={pending || games.length === 0} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-lime-300 px-6 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:pointer-events-none disabled:opacity-50">{pending ? "Creating Tournament..." : "Create Tournament"}</button></div>
    </form>
  );
}
