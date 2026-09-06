"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import {
  createTournament,
  updateTournament,
  type TournamentActionState,
} from "@/app/admin/tournaments/actions";
import { slugify, type TournamentFieldErrors } from "@/lib/tournament-validation";
import { appTimeZoneLabel } from "@/lib/timezone";

type Game = { id: string; name: string };
type TournamentStatusValue =
  | "DRAFT"
  | "UPCOMING"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "LIVE"
  | "COMPLETED"
  | "CANCELLED";

type TournamentFormInitialValues = {
  gameId: string;
  name: string;
  slug: string;
  description: string;
  rules: string;
  bannerUrl: string;
  startTime: string;
  registrationStartTime: string;
  registrationEndTime: string;
  entryFee: string;
  prizePool: string;
  maxParticipants: string;
  tournamentFormat: string;
  region: string;
  joiningWindowMinutes: string;
  status?: TournamentStatusValue;
};

const formats = ["SOLO", "DUO", "SQUAD", "TEAM"] as const;
const initialState: TournamentActionState = { ok: false, errors: {} };

function FieldError({ error }: { error?: string }) {
  return error ? <p className="mt-2 text-xs font-medium text-rose-300">{error}</p> : null;
}

function Label({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return <label className="text-sm font-semibold text-white">{children} {required ? <span className="text-lime-300">*</span> : null}</label>;
}

function inputClasses(error?: string) {
  return `mt-2 w-full rounded-xl border bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-lime-300/60 focus:ring-2 focus:ring-lime-300/10 ${error ? "border-rose-400/60" : "border-white/10"}`;
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"><h2 className="text-lg font-bold text-white">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p><div className="mt-6 grid gap-5">{children}</div></section>;
}

const defaultValues: TournamentFormInitialValues = {
  gameId: "",
  name: "",
  slug: "",
  description: "",
  rules: "",
  bannerUrl: "",
  startTime: "",
  registrationStartTime: "",
  registrationEndTime: "",
  entryFee: "0",
  prizePool: "0",
  maxParticipants: "100",
  tournamentFormat: "",
  region: "India",
  joiningWindowMinutes: "10",
};

export function TournamentForm({
  games,
  mode = "create",
  tournamentId,
  initialValues,
  statusOptions = [],
}: {
  games: Game[];
  mode?: "create" | "edit";
  tournamentId?: string;
  initialValues?: TournamentFormInitialValues;
  statusOptions?: TournamentStatusValue[];
}) {
  const isEdit = mode === "edit";
  const values = { ...defaultValues, ...initialValues };
  const action = isEdit ? updateTournament : createTournament;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [name, setName] = useState(values.name);
  const [slug, setSlug] = useState(values.slug);
  const [slugEdited, setSlugEdited] = useState(isEdit);
  const errors: TournamentFieldErrors = state.errors;

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  return (
    <form action={formAction} className="grid gap-6" noValidate>
      {isEdit && tournamentId ? <input type="hidden" name="tournamentId" value={tournamentId} /> : null}
      {errors.form ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errors.form}</div> : null}

      <Section title="Tournament identity" description="Define the game, name, URL slug, and administrative content.">
        <div><Label required>Game</Label><select name="gameId" defaultValue={values.gameId} className={inputClasses(errors.gameId)}><option value="" disabled>Select a game</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select><FieldError error={errors.gameId} /></div>
        <div><Label required>Tournament Name</Label><input name="name" value={name} onChange={(event) => handleNameChange(event.target.value)} className={inputClasses(errors.name)} placeholder="Valorant Weekend Cup" maxLength={120} /><FieldError error={errors.name} /></div>
        <div><Label required>Slug</Label><input name="slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} className={inputClasses(errors.slug)} placeholder="valorant-weekend-cup" maxLength={120} /><p className="mt-2 text-xs text-slate-600">Lowercase letters, numbers, and single hyphens only.</p><FieldError error={errors.slug} /></div>
        <div><Label>Description</Label><textarea name="description" defaultValue={values.description} className={`${inputClasses(errors.description)} min-h-28 resize-y`} placeholder="Describe this tournament..." maxLength={5000} /><FieldError error={errors.description} /></div>
        <div><Label>Rules</Label><textarea name="rules" defaultValue={values.rules} className={`${inputClasses(errors.rules)} min-h-40 resize-y`} placeholder="Tournament rules and important instructions..." maxLength={10000} /><FieldError error={errors.rules} /></div>
        <div><Label>Banner URL</Label><input name="bannerUrl" type="url" defaultValue={values.bannerUrl} className={inputClasses(errors.bannerUrl)} placeholder="https://example.com/banner.jpg" /><FieldError error={errors.bannerUrl} /></div>
      </Section>

      <Section title="Schedule" description={`All date/time fields use the platform timezone: ${appTimeZoneLabel()}.`}> 
        <div><Label required>Tournament Start</Label><input name="startTime" type="datetime-local" defaultValue={values.startTime} className={inputClasses(errors.startTime)} /><FieldError error={errors.startTime} /></div>
        <div><Label required>Registration Start</Label><input name="registrationStartTime" type="datetime-local" defaultValue={values.registrationStartTime} className={inputClasses(errors.registrationStartTime)} /><FieldError error={errors.registrationStartTime} /></div>
        <div><Label required>Registration End</Label><input name="registrationEndTime" type="datetime-local" defaultValue={values.registrationEndTime} className={inputClasses(errors.registrationEndTime)} /><FieldError error={errors.registrationEndTime} /></div>
      </Section>

      <Section title="Tournament configuration" description="Set the commercial and competitive parameters. Payment processing is not included in this phase.">
        <div className="grid gap-5 sm:grid-cols-2"><div><Label required>Entry Fee</Label><input name="entryFee" type="text" inputMode="decimal" defaultValue={values.entryFee} className={inputClasses(errors.entryFee)} placeholder="0.00" /><FieldError error={errors.entryFee} /></div><div><Label required>Prize Pool</Label><input name="prizePool" type="text" inputMode="decimal" defaultValue={values.prizePool} className={inputClasses(errors.prizePool)} placeholder="0.00" /><FieldError error={errors.prizePool} /></div></div>
        <div className="grid gap-5 sm:grid-cols-2"><div><Label required>Maximum Participants</Label><input name="maxParticipants" type="number" min="1" max="10000" defaultValue={values.maxParticipants} className={inputClasses(errors.maxParticipants)} /><FieldError error={errors.maxParticipants} /></div><div><Label required>Tournament Format</Label><select name="tournamentFormat" defaultValue={values.tournamentFormat} className={inputClasses(errors.tournamentFormat)}><option value="" disabled>Select format</option>{formats.map((format) => <option key={format} value={format}>{format}</option>)}</select><FieldError error={errors.tournamentFormat} /></div></div>
        <div className="grid gap-5 sm:grid-cols-2"><div><Label required>Region / Server</Label><input name="region" defaultValue={values.region} className={inputClasses(errors.region)} placeholder="India" maxLength={100} /><FieldError error={errors.region} /></div><div><Label required>Joining Window (minutes)</Label><input name="joiningWindowMinutes" type="number" min="1" max="120" defaultValue={values.joiningWindowMinutes} className={inputClasses(errors.joiningWindowMinutes)} /><p className="mt-2 text-xs text-slate-600">Configuration only. Room access is implemented later.</p><FieldError error={errors.joiningWindowMinutes} /></div></div>
      </Section>

      {isEdit ? (
        <Section title="Status" description="Status changes follow a conservative server-side transition policy.">
          <div><Label required>Tournament Status</Label><select name="status" defaultValue={values.status} className={inputClasses(errors.status)}>{statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><FieldError error={errors.status} /></div>
        </Section>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><a href={isEdit && tournamentId ? `/admin/tournaments/${tournamentId}` : "/admin/tournaments"} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white">Cancel</a><button type="submit" disabled={pending || games.length === 0} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-lime-300 px-6 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:pointer-events-none disabled:opacity-50">{pending ? (isEdit ? "Saving Changes..." : "Creating Tournament...") : (isEdit ? "Save Changes" : "Create Tournament")}</button></div>
    </form>
  );
}
