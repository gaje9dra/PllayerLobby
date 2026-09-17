import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return createHash("sha256").update(`${secret}:aviator-server-seed`, "utf8").digest();
}

export function encryptAviatorServerSeed(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptAviatorServerSeed(payload: string) {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("INVALID_ENCRYPTED_AVIATOR_SERVER_SEED");
  const [ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  const iv = Buffer.from(ivEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH || ciphertext.length === 0) throw new Error("INVALID_ENCRYPTED_AVIATOR_SERVER_SEED");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
