import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { RegistrationStatus } from "@/app/generated/prisma/client";
import { getCurrentUser, requireActiveUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatRegistrationCode, normalizeRegistrationCode } from "@/lib/registration-code-rules";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptCode(code: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((value) => value.toString("base64url")).join(".");
}

function decryptCode(payload: string) {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Invalid registration code storage.");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
}

export function hashRegistrationCode(input: string) {
  const normalized = normalizeRegistrationCode(input);
  if (!normalized) return null;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function createRegistrationCodeData() {
  let compact = "";
  for (let index = 0; index < 12; index += 1) {
    compact += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  const code = formatRegistrationCode(compact);
  return {
    code,
    codeHash: createHash("sha256").update(compact, "utf8").digest("hex"),
    codeEncrypted: encryptCode(code),
  };
}

export async function getRegistrationCodeForUser(registrationId: string) {
  const user = await requireActiveUser();
  const record = await prisma.registrationCode.findFirst({
    where: {
      registrationId,
      revokedAt: null,
      registration: {
        userId: user.id,
        status: RegistrationStatus.CONFIRMED,
      },
    },
    select: { codeEncrypted: true },
  });
  return record ? decryptCode(record.codeEncrypted) : null;
}

export async function validateRegistrationCode(
  registrationId: string,
  tournamentId: string,
  input: string,
) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return false;

  const codeHash = hashRegistrationCode(input);
  if (!codeHash) return false;

  const record = await prisma.registrationCode.findFirst({
    where: {
      codeHash,
      revokedAt: null,
      registration: {
        id: registrationId,
        tournamentId,
        userId: user.id,
        status: RegistrationStatus.CONFIRMED,
      },
    },
    select: { codeHash: true },
  });

  if (!record) return false;
  const actual = Buffer.from(record.codeHash, "hex");
  const expected = Buffer.from(codeHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function revokeRegistrationCode(registrationId: string) {
  await requireAdmin();
  const record = await prisma.registrationCode.findUnique({ where: { registrationId }, select: { id: true } });
  if (!record) return false;
  await prisma.registrationCode.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return true;
}
