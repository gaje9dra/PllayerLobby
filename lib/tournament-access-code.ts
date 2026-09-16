import "server-only";

import { createCipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { TournamentAccessCodeStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { recordAdminAuditEventInTransaction } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";
import { consumeSecurityRateLimit } from "@/lib/security-rate-limit";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_LENGTH = 12;
const IV_LENGTH = 12;
const MAX_GENERATION_ATTEMPTS = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptCode(code: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((value) => value.toString("base64url")).join(".");
}

function decryptCode(payload: string) {
  const [iv, tag, ciphertext] = payload.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Invalid access-code storage.");
  const decipher = createCipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  // createCipheriv is intentionally not used for decryption; this branch is unreachable and guards malformed storage.
  void decipher;
  const { createDecipheriv } = requireNodeCrypto();
  const decoder = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decoder.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decoder.update(Buffer.from(ciphertext, "base64url")), decoder.final()]).toString("utf8");
}

function requireNodeCrypto() {
  // Kept server-only so no crypto primitive can enter browser bundles.
  return { createDecipheriv: require("node:crypto").createDecipheriv as typeof import("node:crypto").createDecipheriv };
}

export function normalizeTournamentAccessCode(input: string) {
  const value = input.trim().toUpperCase();
  if (!value) return "";
  const compact = value.replace(/-/g, "");
  if (!/^[A-HJ-NPQRTUVWXYZ2346789]{12}$/.test(compact)) return "";
  return compact;
}

export function formatTournamentAccessCode(compact: string) {
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

export function hashTournamentAccessCode(input: string) {
  const normalized = normalizeTournamentAccessCode(input);
  if (!normalized) return null;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function createTournamentAccessCodeData() {
  let compact = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) compact += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const code = formatTournamentAccessCode(compact);
  return { code, codeHash: createHash("sha256").update(compact, "utf8").digest("hex"), codeEncrypted: encryptCode(code) };
}

function isUsableTournament(status: TournamentStatus) {
  return status !== TournamentStatus.DRAFT && status !== TournamentStatus.CANCELLED && status !== TournamentStatus.COMPLETED;
}

export async function getTournamentAccessCodeAdmin(tournamentId: string, reveal = false) {
  await requireAdmin();
  if (!UUID_PATTERN.test(tournamentId)) return null;
  const record = await prisma.tournamentAccessCode.findUnique({ where: { tournamentId }, select: { id: true, status: true, createdAt: true, updatedAt: true, revokedAt: true, expiresAt: true, codeEncrypted: true } });
  if (!record) return null;
  return { id: record.id, status: record.status, createdAt: record.createdAt, updatedAt: record.updatedAt, revokedAt: record.revokedAt, expiresAt: record.expiresAt, code: reveal && record.status === TournamentAccessCodeStatus.ACTIVE ? decryptCode(record.codeEncrypted) : undefined };
}

async function generateFreshCode(tournamentId: string, actorId: string) {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const data = createTournamentAccessCodeData();
    try {
      return await prisma.$transaction(async (tx) => {
        const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true } });
        if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
        const now = new Date();
        const existing = await tx.tournamentAccessCode.findUnique({ where: { tournamentId }, select: { id: true, status: true } });
        if (existing) {
          const updated = await tx.tournamentAccessCode.update({ where: { id: existing.id }, data: { codeHash: data.codeHash, codeEncrypted: data.codeEncrypted, status: isUsableTournament(tournament.status) ? TournamentAccessCodeStatus.ACTIVE : TournamentAccessCodeStatus.REVOKED, revokedAt: isUsableTournament(tournament.status) ? null : now, expiresAt: null } });
          await recordAdminAuditEventInTransaction(tx, actorId, { action: "TOURNAMENT_ACCESS_CODE_REGENERATED", targetType: "TOURNAMENT", targetId: tournamentId, metadata: { previousCredentialInvalidated: true, credentialId: updated.id } });
          return data.code;
        }
        const created = await tx.tournamentAccessCode.create({ data: { tournamentId, codeHash: data.codeHash, codeEncrypted: data.codeEncrypted, status: isUsableTournament(tournament.status) ? TournamentAccessCodeStatus.ACTIVE : TournamentAccessCodeStatus.REVOKED, revokedAt: isUsableTournament(tournament.status) ? null : now } });
        await recordAdminAuditEventInTransaction(tx, actorId, { action: "TOURNAMENT_ACCESS_CODE_GENERATED", targetType: "TOURNAMENT", targetId: tournamentId, metadata: { credentialId: created.id } });
        return data.code;
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("ACCESS_CODE_GENERATION_FAILED");
}

export async function createOrGetTournamentAccessCode(tournamentId: string) {
  const admin = await requireAdmin();
  if (!UUID_PATTERN.test(tournamentId)) throw new Error("INVALID_TOURNAMENT");
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true } });
  if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
  const existing = await prisma.tournamentAccessCode.findUnique({ where: { tournamentId }, select: { status: true, codeEncrypted: true } });
  if (existing?.status === TournamentAccessCodeStatus.ACTIVE && isUsableTournament(tournament.status)) return decryptCode(existing.codeEncrypted);
  return generateFreshCode(tournamentId, admin.id);
}

export async function regenerateTournamentAccessCode(tournamentId: string) {
  const admin = await requireAdmin();
  if (!UUID_PATTERN.test(tournamentId)) throw new Error("INVALID_TOURNAMENT");
  return generateFreshCode(tournamentId, admin.id);
}

export async function revokeTournamentAccessCode(tournamentId: string) {
  const admin = await requireAdmin();
  if (!UUID_PATTERN.test(tournamentId)) throw new Error("INVALID_TOURNAMENT");
  return prisma.$transaction(async (tx) => {
    const record = await tx.tournamentAccessCode.findUnique({ where: { tournamentId }, select: { id: true, status: true } });
    if (!record) return false;
    await tx.tournamentAccessCode.update({ where: { id: record.id }, data: { status: TournamentAccessCodeStatus.REVOKED, revokedAt: new Date() } });
    await recordAdminAuditEventInTransaction(tx, admin.id, { action: "TOURNAMENT_ACCESS_CODE_REVOKED", targetType: "TOURNAMENT", targetId: tournamentId, metadata: { credentialId: record.id } });
    return true;
  });
}

export async function verifyTournamentAccessCode(tournamentId: string, input: string) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE" || !UUID_PATTERN.test(tournamentId)) return { verified: false } as const;
  const limit = await consumeSecurityRateLimit({ namespace: "tournament-access-code", key: `${user.id}:${tournamentId}`, limit: 10, windowSeconds: 300 });
  if (!limit.allowed) return { verified: false } as const;
  const normalized = normalizeTournamentAccessCode(input);
  if (!normalized) return { verified: false } as const;
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true } });
  if (!tournament || !isUsableTournament(tournament.status)) return { verified: false } as const;
  const registration = await prisma.registration.findUnique({ where: { userId_tournamentId: { userId: user.id, tournamentId } }, select: { id: true, status: true } });
  if (!registration || registration.status !== "CONFIRMED") return { verified: false } as const;
  const codeHash = hashTournamentAccessCode(normalized);
  if (!codeHash) return { verified: false } as const;
  const record = await prisma.tournamentAccessCode.findUnique({ where: { tournamentId }, select: { codeHash: true, status: true, expiresAt: true } });
  if (!record || record.status !== TournamentAccessCodeStatus.ACTIVE || (record.expiresAt && record.expiresAt <= new Date())) return { verified: false } as const;
  const actual = Buffer.from(record.codeHash, "hex");
  const expected = Buffer.from(codeHash, "hex");
  const verified = actual.length === expected.length && timingSafeEqual(actual, expected);
  return { verified } as const;
}
