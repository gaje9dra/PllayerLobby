import "server-only";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_URL_LENGTH = 2048;
const MAX_SLUG_LENGTH = 80;
const MAX_CODE_LENGTH = 80;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_TEXT_PATTERN = /[<>]/;

export type GameInput = {
  name: unknown;
  slug?: unknown;
  description?: unknown;
  logoUrl?: unknown;
  isActive?: unknown;
};

function text(value: unknown, maxLength: number, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new GameValidationError("Game name is required.");
  if (result.length > maxLength) throw new GameValidationError("A game field is too long.");
  if (/[\u0000-\u001f\u007f]/.test(result) || SAFE_TEXT_PATTERN.test(result)) {
    throw new GameValidationError("Game input contains unsupported characters.");
  }
  return result;
}

export function slugifyGameName(name: string) {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  if (!slug || !SLUG_PATTERN.test(slug)) throw new GameValidationError("Unable to generate a valid game slug.");
  return slug;
}

function validateSlug(value: unknown) {
  const slug = text(value, MAX_SLUG_LENGTH, true).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) throw new GameValidationError("Slug may contain only lowercase letters, numbers, and hyphens.");
  return slug;
}

function validateLogoUrl(value: unknown) {
  const url = text(value, MAX_URL_LENGTH);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
  } catch {
    throw new GameValidationError("Logo URL must be a valid HTTP(S) URL.");
  }
  return url;
}

function gameCode(slug: string) {
  const base = slug.replace(/-/g, "_").toUpperCase().slice(0, MAX_CODE_LENGTH);
  return base || "GAME";
}

export class GameValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameValidationError";
  }
}

export function normalizeGameInput(input: GameInput) {
  const name = text(input.name, MAX_NAME_LENGTH, true);
  const slug = input.slug === undefined || input.slug === null || String(input.slug).trim() === "" ? slugifyGameName(name) : validateSlug(input.slug);
  const description = text(input.description, MAX_DESCRIPTION_LENGTH) || null;
  const logoUrl = validateLogoUrl(input.logoUrl);
  const isActive = input.isActive === undefined ? true : input.isActive === true;
  return { name, slug, description, logoUrl, isActive };
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

async function assertUniqueGame(input: { name: string; slug: string; excludeId?: string }) {
  const duplicate = await prisma.game.findFirst({
    where: {
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: [
        { slug: input.slug },
        { name: { equals: input.name, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, slug: true },
  });
  if (duplicate) {
    if (duplicate.slug === input.slug) throw new GameValidationError("This game slug is already in use.");
    throw new GameValidationError("A game with this name already exists.");
  }
}

export async function listGames(input: { search?: string; status?: string }) {
  await requireAdmin();
  const search = (input.search ?? "").trim().slice(0, 80);
  const status = input.status === "ACTIVE" || input.status === "INACTIVE" ? input.status : "ALL";
  return prisma.game.findMany({
    where: {
      ...(status === "ACTIVE" ? { isActive: true } : status === "INACTIVE" ? { isActive: false } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { tournaments: true } } },
  });
}

export async function listActiveGames() {
  return prisma.game.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, slug: true, description: true, logoUrl: true, isActive: true },
  });
}

export async function createGame(input: GameInput) {
  const admin = await requireAdmin();
  const values = normalizeGameInput(input);
  await assertUniqueGame(values);
  const code = gameCode(values.slug);
  try {
    return await prisma.$transaction(async (tx) => {
      const existingCode = await tx.game.findUnique({ where: { code }, select: { id: true } });
      if (existingCode) throw new GameValidationError("A game with this slug-derived code already exists.");
      const game = await tx.game.create({ data: { ...values, code } });
      await recordAdminAuditEventInTransaction(tx, admin.id, { action: "GAME_CREATED", targetType: "GAME", targetId: game.id, metadata: { name: game.name, slug: game.slug } });
      return game;
    });
  } catch (error) {
    if (error instanceof GameValidationError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new GameValidationError("A game with this name, slug, or code already exists.");
    throw error;
  }
}

export async function updateGame(id: string, input: GameInput) {
  const admin = await requireAdmin();
  if (!isUuid(id)) throw new GameValidationError("Invalid game identifier.");
  const values = normalizeGameInput(input);
  const existing = await prisma.game.findUnique({ where: { id }, select: { id: true, name: true, slug: true, isActive: true } });
  if (!existing) throw new GameValidationError("Game not found.");
  await assertUniqueGame({ ...values, excludeId: id });
  try {
    return await prisma.$transaction(async (tx) => {
      const game = await tx.game.update({ where: { id }, data: values });
      const action = existing.isActive === game.isActive ? "GAME_UPDATED" : game.isActive ? "GAME_ACTIVATED" : "GAME_DEACTIVATED";
      await recordAdminAuditEventInTransaction(tx, admin.id, { action, targetType: "GAME", targetId: game.id, metadata: { name: game.name, slug: game.slug, previousActive: existing.isActive, isActive: game.isActive } });
      return game;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new GameValidationError("A game with this name or slug already exists.");
    throw error;
  }
}

export async function deleteGame(id: string) {
  const admin = await requireAdmin();
  if (!isUuid(id)) throw new GameValidationError("Invalid game identifier.");
  const existing = await prisma.game.findUnique({ where: { id }, include: { _count: { select: { tournaments: true } } } });
  if (!existing) throw new GameValidationError("Game not found.");
  if (existing._count.tournaments > 0) throw new GameValidationError("This game has tournament history and cannot be permanently deleted. Deactivate it instead.");
  await prisma.$transaction(async (tx) => {
    await tx.game.delete({ where: { id } });
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: "GAME_DELETED", targetType: "GAME", targetId: id, metadata: { name: existing.name, slug: existing.slug } });
  });
}
