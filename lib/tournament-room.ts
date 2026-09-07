import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { RegistrationStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateRegistrationCode } from "@/lib/registration-code";
import { refreshTournamentLifecycle } from "@/lib/tournament-lifecycle";
import { isJoiningWindowOpen, isTournamentJoinableStatus } from "@/lib/tournament-room-rules";

const IV_LENGTH = 12;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ROOM_ID_LENGTH = 120;
const MAX_ROOM_PASSWORD_LENGTH = 200;

function getEncryptionKey() { const secret = process.env.AUTH_SECRET; if (!secret) throw new Error("AUTH_SECRET is not configured."); return createHash("sha256").update(`${secret}:tournament-room`, "utf8").digest(); }
function encryptSecret(value: string) { const iv = randomBytes(IV_LENGTH); const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv); const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); const tag = cipher.getAuthTag(); return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join("."); }
function decryptSecret(payload: string) { const [iv, tag, ciphertext] = payload.split("."); if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted room credential."); const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url")); return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"); }
function normalizeRoomValue(value: string, maxLength: number) { const normalized = value.trim(); if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) return null; return normalized; }

export type RoomMutationResult = { ok: true } | { ok: false; message: string };

export async function upsertTournamentRoom(input: { tournamentId: string; roomId: string; roomPassword: string; published: boolean }): Promise<RoomMutationResult> {
  await requireAdmin();
  if (!UUID_PATTERN.test(input.tournamentId)) return { ok: false, message: "Tournament not found." };
  const roomId = normalizeRoomValue(input.roomId, MAX_ROOM_ID_LENGTH);
  const roomPassword = normalizeRoomValue(input.roomPassword, MAX_ROOM_PASSWORD_LENGTH);
  if (!roomId || !roomPassword) return { ok: false, message: "Room ID and room password are required and must be within the allowed length." };
  const tournament = await prisma.tournament.findUnique({ where: { id: input.tournamentId }, select: { id: true, status: true } });
  if (!tournament) return { ok: false, message: "Tournament not found." };
  if (tournament.status === TournamentStatus.COMPLETED || tournament.status === TournamentStatus.CANCELLED) return { ok: false, message: "Room credentials cannot be activated for a completed or cancelled tournament." };
  const now = new Date();
  await prisma.tournamentRoom.upsert({
    where: { tournamentId: tournament.id },
    create: { tournamentId: tournament.id, roomIdEncrypted: encryptSecret(roomId), roomPasswordEncrypted: encryptSecret(roomPassword), publishedAt: input.published ? now : null, revokedAt: null },
    update: { roomIdEncrypted: encryptSecret(roomId), roomPasswordEncrypted: encryptSecret(roomPassword), publishedAt: input.published ? now : null, revokedAt: input.published ? null : new Date() },
  });
  return { ok: true };
}

export async function revokeTournamentRoom(tournamentId: string): Promise<RoomMutationResult> {
  await requireAdmin();
  if (!UUID_PATTERN.test(tournamentId)) return { ok: false, message: "Tournament not found." };
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } });
  if (!tournament) return { ok: false, message: "Tournament not found." };
  await prisma.tournamentRoom.updateMany({ where: { tournamentId }, data: { revokedAt: new Date(), publishedAt: null } });
  return { ok: true };
}

export async function getAdminTournamentRoom(tournamentId: string) {
  await requireAdmin();
  if (!UUID_PATTERN.test(tournamentId)) return null;
  const room = await prisma.tournamentRoom.findUnique({ where: { tournamentId }, select: { tournamentId: true, roomIdEncrypted: true, roomPasswordEncrypted: true, publishedAt: true, revokedAt: true, updatedAt: true } });
  if (!room) return null;
  return { tournamentId: room.tournamentId, roomId: decryptSecret(room.roomIdEncrypted), roomPassword: decryptSecret(room.roomPasswordEncrypted), publishedAt: room.publishedAt, revokedAt: room.revokedAt, updatedAt: room.updatedAt };
}

export type ParticipantRoomAccess = { ok: true; roomId: string; roomPassword: string } | { ok: false; reason: string };

export async function getParticipantRoomAccess(input: { tournamentId: string; registrationId: string; registrationCode: string }): Promise<ParticipantRoomAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "Login to continue." };
  if (user.status !== "ACTIVE") return { ok: false, reason: "Your account is not currently eligible to join." };
  if (!UUID_PATTERN.test(input.tournamentId) || !UUID_PATTERN.test(input.registrationId)) return { ok: false, reason: "Unable to access tournament joining details." };
  await refreshTournamentLifecycle(input.tournamentId);
  const tournament = await prisma.tournament.findUnique({ where: { id: input.tournamentId }, select: { id: true, status: true, startTime: true, joiningWindowMinutes: true } });
  if (!tournament) return { ok: false, reason: "Tournament not found." };
  if (tournament.status === TournamentStatus.CANCELLED) return { ok: false, reason: "This tournament has been cancelled." };
  if (tournament.status === TournamentStatus.COMPLETED) return { ok: false, reason: "Tournament joining is closed." };
  if (!isTournamentJoinableStatus(tournament.status)) return { ok: false, reason: "Tournament joining is unavailable." };
  const registration = await prisma.registration.findUnique({ where: { id: input.registrationId }, select: { id: true, userId: true, tournamentId: true, status: true } });
  if (!registration || registration.userId !== user.id || registration.tournamentId !== tournament.id) return { ok: false, reason: "You are not registered for this tournament." };
  if (registration.status !== RegistrationStatus.CONFIRMED) return { ok: false, reason: "Your registration is not confirmed yet." };
  if (!(await validateRegistrationCode(registration.id, tournament.id, input.registrationCode))) return { ok: false, reason: "The registration code is invalid." };
  if (!isJoiningWindowOpen(new Date(), tournament.startTime, tournament.joiningWindowMinutes)) return { ok: false, reason: "Joining information will become available shortly before the tournament." };
  const room = await prisma.tournamentRoom.findUnique({ where: { tournamentId: tournament.id }, select: { roomIdEncrypted: true, roomPasswordEncrypted: true, publishedAt: true, revokedAt: true } });
  if (!room || !room.publishedAt || room.revokedAt) return { ok: false, reason: "Room details are not available yet. Please check again shortly." };
  return { ok: true, roomId: decryptSecret(room.roomIdEncrypted), roomPassword: decryptSecret(room.roomPasswordEncrypted) };
}
