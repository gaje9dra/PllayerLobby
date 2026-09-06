"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TournamentFormat, TournamentStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  validateTournamentInput,
  type TournamentFieldErrors,
  type TournamentFormValues,
} from "@/lib/tournament-validation";
import { parseAppLocalDateTime } from "@/lib/timezone";

export type CreateTournamentState = {
  ok: boolean;
  errors: TournamentFieldErrors;
};

function getValues(formData: FormData): TournamentFormValues {
  const get = (key: keyof TournamentFormValues) => String(formData.get(key) ?? "");

  return {
    gameId: get("gameId"),
    name: get("name"),
    slug: get("slug"),
    description: get("description"),
    rules: get("rules"),
    bannerUrl: get("bannerUrl"),
    startTime: get("startTime"),
    registrationStartTime: get("registrationStartTime"),
    registrationEndTime: get("registrationEndTime"),
    entryFee: get("entryFee"),
    prizePool: get("prizePool"),
    maxParticipants: get("maxParticipants"),
    tournamentFormat: get("tournamentFormat"),
    region: get("region"),
    joiningWindowMinutes: get("joiningWindowMinutes"),
  };
}

export async function createTournament(
  _previousState: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  await requireAdmin();

  const values = getValues(formData);
  const errors = validateTournamentInput(values);

  const startTime = parseAppLocalDateTime(values.startTime);
  const registrationStartTime = parseAppLocalDateTime(values.registrationStartTime);
  const registrationEndTime = parseAppLocalDateTime(values.registrationEndTime);

  if (!startTime) errors.startTime = "Please enter a valid start date and time.";
  if (!registrationStartTime) {
    errors.registrationStartTime = "Please enter a valid registration start date and time.";
  }
  if (!registrationEndTime) {
    errors.registrationEndTime = "Please enter a valid registration end date and time.";
  }

  if (registrationStartTime && registrationEndTime && registrationStartTime >= registrationEndTime) {
    errors.registrationStartTime = "Registration start time must be before registration end time.";
    errors.registrationEndTime = "Registration end time must be after registration start time.";
  }

  if (registrationEndTime && startTime && registrationEndTime > startTime) {
    errors.registrationEndTime = "Registration cannot end after the tournament starts.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const game = await prisma.game.findUnique({
    where: { id: values.gameId },
    select: { id: true, isActive: true },
  });

  if (!game || !game.isActive) {
    return {
      ok: false,
      errors: { gameId: "The selected game is unavailable or inactive." },
    };
  }

  const slug = values.slug.trim();
  const existingSlug = await prisma.tournament.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existingSlug) {
    return { ok: false, errors: { slug: "This tournament slug is already in use." } };
  }

  try {
    await prisma.tournament.create({
      data: {
        gameId: game.id,
        name: values.name.trim(),
        slug,
        description: values.description.trim() || null,
        rules: values.rules.trim() || null,
        bannerUrl: values.bannerUrl.trim() || null,
        startTime: startTime!,
        registrationStartTime: registrationStartTime!,
        registrationEndTime: registrationEndTime!,
        entryFee: values.entryFee.trim(),
        prizePool: values.prizePool.trim(),
        maxParticipants: Number.parseInt(values.maxParticipants, 10),
        tournamentFormat: values.tournamentFormat as TournamentFormat,
        region: values.region.trim(),
        status: TournamentStatus.DRAFT,
        joiningWindowMinutes: Number.parseInt(values.joiningWindowMinutes, 10),
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { ok: false, errors: { slug: "This tournament slug is already in use." } };
    }

    console.error("Tournament creation failed:", error);
    return {
      ok: false,
      errors: { form: "Unable to create the tournament right now. Please try again." },
    };
  }

  revalidatePath("/admin/tournaments");
  redirect("/admin/tournaments?created=1");
}
