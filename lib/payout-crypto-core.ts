import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export function encryptPayoutDataWithKey(plaintext: string, key: Buffer) {
  if (key.length !== KEY_LENGTH) throw new Error("PAYOUT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptPayoutDataWithKey(payload: string, key: Buffer) {
  if (key.length !== KEY_LENGTH) throw new Error("PAYOUT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  const parts = payload.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error("Invalid encrypted payout destination data.");
  const [ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  const iv = Buffer.from(ivEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) throw new Error("Invalid encrypted payout destination data.");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
}
