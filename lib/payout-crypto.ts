import "server-only";

import { decryptPayoutDataWithKey, encryptPayoutDataWithKey } from "@/lib/payout-crypto-core";

const KEY_LENGTH = 32;

function getKey() {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) throw new Error("PAYOUT_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) throw new Error("PAYOUT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encryptPayoutData(plaintext: string) {
  return encryptPayoutDataWithKey(plaintext, getKey());
}

export function decryptPayoutData(payload: string) {
  return decryptPayoutDataWithKey(payload, getKey());
}
