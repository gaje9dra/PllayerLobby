import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function getKey() {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) throw new Error("PAYOUT_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) throw new Error("PAYOUT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encryptPayoutData(plaintext: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptPayoutData(payload: string) {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Invalid encrypted payout destination data.");
  const iv = Buffer.from(ivEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== 16) throw new Error("Invalid encrypted payout destination data.");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
}
