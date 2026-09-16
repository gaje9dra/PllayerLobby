import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return createHash("sha256").update(`${secret}:match-room-credential`, "utf8").digest();
}

function decodeBase64Url(value: string, label: string) {
  if (!value || !BASE64URL.test(value)) throw new Error(`INVALID_ENCRYPTED_ROOM_CREDENTIAL_${label}`);
  const decoded = Buffer.from(value, "base64url");
  // Require the canonical representation and valid zero padding bits. Node's
  // decoder otherwise accepts alternate final characters that decode to the
  // same bytes, which can make a one-character tamper test ineffective.
  if (decoded.toString("base64url") !== value) throw new Error("INVALID_ENCRYPTED_ROOM_CREDENTIAL");
  const remainder = decoded.length % 3;
  if (remainder !== 0) {
    const finalIndex = BASE64URL_ALPHABET.indexOf(value[value.length - 1]);
    const unusedBits = remainder === 1 ? 4 : 2;
    const mask = (1 << unusedBits) - 1;
    if ((finalIndex & mask) !== 0) throw new Error("INVALID_ENCRYPTED_ROOM_CREDENTIAL");
  }
  return decoded;
}

export function encryptMatchRoomSecret(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptMatchRoomSecret(payload: string) {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("INVALID_ENCRYPTED_ROOM_CREDENTIAL");
  const [ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  const iv = decodeBase64Url(ivEncoded, "IV");
  const tag = decodeBase64Url(tagEncoded, "TAG");
  const ciphertext = decodeBase64Url(ciphertextEncoded, "CIPHERTEXT");
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error("INVALID_ENCRYPTED_ROOM_CREDENTIAL");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
