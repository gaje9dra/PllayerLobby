"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TournamentFormat, TournamentPrizeStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";
import { canAdminSetTournamentStatus } from "@/lib/tournament-lifecycle-rules";
import { validateTournamentInput, type TournamentFieldErrors, type TournamentFormValues } from "@/lib/tournament-validation";
import { parseAppLocalDateTime } from "@/lib/timezone";

export type TournamentActionState = { ok: boolean; errors: TournamentFieldErrors };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value: string) { return UUID_PATTERN.test(value); }
function getValues(formData: FormData): TournamentFormValues {
  const get = (key: keyof TournamentFormValues) => String(formData.get(key) ?? "");
  return { gameId: get("gameId"), name: get("name"), slug: get("slug"), description: get("description"), rules: get("rules"), bannerUrl: get("bannerUrl"), startTime: get("startTime"), registrationStartTime: get("registrationStartTime"), registrationEndTime: get("registrationEndTime"), entryFee: get("entryFee"), prizePool: get("prizePool"), maxParticipants: get("maxParticipants"), tournamentFormat: get("tournamentFormat"), region: get("region"), joiningWindowMinutes: get("joiningWindowMinutes") };
}
function getSchedule(values: TournamentFormValues, errors: TournamentFieldErrors) {
  const startTime = parseAppLocalDateTime(values.startTime);
  const registrationStartTime = parseAppLocalDateTime(values.registrationStartTime);
  const registrationEndTime = parseAppLocalDateTime(values.registrationEndTime);
  if (!startTime) errors.startTime = "Please enter a valid start date and time.";
  if (!registrationStartTime) errors.registrationStartTime = "Please enter a valid registration start date and time.";
  if (!registrationEndTime) errors.registrationEndTime = "Please enter a valid registration end date and time.";
  if (registrationStartTime && registrationEndTime && registrationStartTime >= registrationEndTime) { errors.registrationStartTime = "Registration start time must be before registration end time."; errors.registrationEndTime = "Registration end time must be after registration start time."; }
  if (registrationEndTime && startTime && registrationEndTime > startTime) errors.registrationEndTime = "Registration cannot end after the tournament starts.";
  return { startTime, registrationStartTime, registrationEndTime };
}
async function validateCommonUpdate(values: TournamentFormValues, tournamentId: string) {
  const errors = validateTournamentInput(values);
  const schedule = getSchedule(values, errors);
  if (!isUuid(tournamentId)) return { errors: { form: "Invalid tournament identifier." } as TournamentFieldErrors, schedule };
  if (!isUuid(values.gameId)) { errors.gameId = "Please select a valid game."; return { errors, schedule }; }
  if (Object.keys(errors).length > 0) return { errors, schedule };
  const game = await prisma.game.findUnique({ where: { id: values.gameId }, select: { id: true, isActive: true } });
  if (!game || !game.isActive) return { errors: { gameId: "The selected game is unavailable or inactive." }, schedule };
  const existingSlug = await prisma.tournament.findUnique({ where: { slug: values.slug.trim() }, select: { id: true } });
  if (existingSlug && existingSlug.id !== tournamentId) return { errors: { slug: "This tournament slug is already in use." }, schedule };
  return { errors: {}, schedule };
}

export async function createTournament(_previousState: TournamentActionState, formData: FormData): Promise<TournamentActionState> {
  const admin = await requireAdmin();
  const values = getValues(formData);
  const errors = validateTournamentInput(values);
  const schedule = getSchedule(values, errors);
  if (!isUuid(values.gameId)) errors.gameId = "Please select a valid game.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const game = await prisma.game.findUnique({ where: { id: values.gameId }, select: { id: true, isActive: true } });
  if (!game || !game.isActive) return { ok: false, errors: { gameId: "The selected game is unavailable or inactive." } };
  const slug = values.slug.trim();
  const existingSlug = await prisma.tournament.findUnique({ where: { slug }, select: { id: true } });
  if (existingSlug) return { ok: false, errors: { slug: "This tournament slug is already in use." } };
  let tournamentId: string;
  try {
    tournamentId = await prisma.$transaction(async (tx) => {
      const created = await tx.tournament.create({ data: { gameId: game.id, name: values.name.trim(), slug, description: values.description.trim() || null, rules: values.rules.trim() || null, bannerUrl: values.bannerUrl.trim() || null, startTime: schedule.startTime!, registrationStartTime: schedule.registrationStartTime!, registrationEndTime: schedule.registrationEndTime!, entryFee: values.entryFee.trim(), prizePool: values.prizePool.trim(), maxParticipants: Number.parseInt(values.maxParticipants, 10), tournamentFormat: values.tournamentFormat as TournamentFormat, region: values.region.trim(), status: TournamentStatus.DRAFT, joiningWindowMinutes: Number.parseInt(values.joiningWindowMinutes, 10) } });
      await recordAdminAuditEventInTransaction(tx, admin.id, { action: "TOURNAMENT_CREATED", targetType: "TOURNAMENT", targetId: created.id, metadata: { status: created.status, gameId: created.gameId } });
      return created.id;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { ok: false, errors: { slug: "This tournament slug is already in use." } };
    console.error("Tournament creation failed:", error);
    return { ok: false, errors: { form: "Unable to create the tournament right now. Please try again." } };
  }
  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments/${tournamentId}?created=1`);
}

export async function updateTournament(_previousState: TournamentActionState, formData: FormData): Promise<TournamentActionState> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!isUuid(tournamentId)) return { ok: false, errors: { form: "Invalid tournament identifier." } };
  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true, startTime: true, registrationStartTime: true, registrationEndTime: true, prizePool: true, entryFee: true, maxParticipants: true } });
  if (!existing) return { ok: false, errors: { form: "Tournament not found." } };
  const participantCount = await prisma.registration.count({ where: { tournamentId, status: { not: "CANCELLED" } } });
  const values = getValues(formData);
  const { errors, schedule } = await validateCommonUpdate(values, tournamentId);
  const status = String(formData.get("status") ?? "");
  if (!Object.values(TournamentStatus).includes(status as TournamentStatus)) errors.status = "Please select a valid tournament status.";
  else if (!canAdminSetTournamentStatus(existing.status, status as TournamentStatus, { status: existing.status, startTime: schedule.startTime ?? existing.startTime, registrationStartTime: schedule.registrationStartTime ?? existing.registrationStartTime, registrationEndTime: schedule.registrationEndTime ?? existing.registrationEndTime }, new Date())) errors.status = `Cannot change status from ${existing.status} to ${status} before its lifecycle condition is met.`;
  if (!Object.values(TournamentFormat).includes(values.tournamentFormat as TournamentFormat)) errors.tournamentFormat = "Please select a valid tournament format.";
  const newMaxParticipants = Number.parseInt(values.maxParticipants, 10);
  if (Number.isSafeInteger(newMaxParticipants) && newMaxParticipants < participantCount) errors.maxParticipants = `Maximum participants cannot be below the current participant count (${participantCount}).`;
  if (participantCount > 0 && values.entryFee.trim() !== existing.entryFee.toString()) errors.entryFee = "Entry fee cannot be changed after users have registered. Historical entry payments must remain unchanged.";
  const finalizedPrizeCount = await prisma.tournamentPrize.count({ where: { tournamentId, status: TournamentPrizeStatus.FINALIZED } });
  if (finalizedPrizeCount > 0 && values.prizePool.trim() !== existing.prizePool.toString()) errors.prizePool = "The prize pool cannot be changed while the prize configuration is finalized. Use the explicit prize reconfiguration workflow in a later phase.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.tournament.updateMany({ where: { id: tournamentId, status: existing.status }, data: { gameId: values.gameId, name: values.name.trim(), slug: values.slug.trim(), description: values.description.trim() || null, rules: values.rules.trim() || null, bannerUrl: values.bannerUrl.trim() || null, startTime: schedule.startTime!, registrationStartTime: schedule.registrationStartTime!, registrationEndTime: schedule.registrationEndTime!, entryFee: values.entryFee.trim(), prizePool: values.prizePool.trim(), maxParticipants: newMaxParticipants, tournamentFormat: values.tournamentFormat as TournamentFormat, region: values.region.trim(), status: status as TournamentStatus, joiningWindowMinutes: Number.parseInt(values.joiningWindowMinutes, 10) } });
      if (updated.count !== 1) throw new Error("TOURNAMENT_CHANGED");
      await recordAdminAuditEventInTransaction(tx, admin.id, { action: "TOURNAMENT_UPDATED", targetType: "TOURNAMENT", targetId: tournamentId, metadata: { fromStatus: existing.status, toStatus: status, participantCount } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TOURNAMENT_CHANGED") return { ok: false, errors: { form: "The tournament changed while you were editing it. Please reload and try again." } };
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { ok: false, errors: { slug: "This tournament slug is already in use." } };
    console.error("Tournament update failed:", error);
    return { ok: false, errors: { form: "Unable to update the tournament right now. Please try again." } };
  }
  revalidatePath("/admin/tournaments");
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath(`/admin/tournaments/${tournamentId}/edit`);
  revalidatePath(`/admin/tournaments/${tournamentId}/prizes`);
  redirect(`/admin/tournaments/${tournamentId}?updated=1`);
}

export type CancelTournamentState = { ok: boolean; error?: string };
export async function cancelTournament(_previousState: CancelTournamentState, formData: FormData): Promise<CancelTournamentState> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!isUuid(tournamentId)) return { ok: false, error: "Invalid tournament identifier." };
  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true } });
  if (!existing) return { ok: false, error: "Tournament not found." };
  if (existing.status === TournamentStatus.CANCELLED) return { ok: false, error: "Tournament is already cancelled." };
  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.tournament.updateMany({ where: { id: tournamentId, status: existing.status }, data: { status: TournamentStatus.CANCELLED } });
      if (result.count !== 1) throw new Error("TOURNAMENT_CHANGED");
      await recordAdminAuditEventInTransaction(tx, admin.id, { action: "TOURNAMENT_CANCELLED", targetType: "TOURNAMENT", targetId: tournamentId, metadata: { fromStatus: existing.status } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TOURNAMENT_CHANGED") return { ok: false, error: "The tournament changed while you were cancelling it. Please reload and try again." };
    console.error("Tournament cancellation failed:", error);
    return { ok: false, error: "Unable to cancel the tournament right now. Please try again." };
  }
  revalidatePath("/admin/tournaments");
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath(`/admin/tournaments/${tournamentId}/edit`);
  redirect(`/admin/tournaments/${tournamentId}?cancelled=1`);
}
