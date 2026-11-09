import "server-only";

import { decryptPayoutDataWithKey, decodePayoutEncryptionKey, encryptPayoutDataWithKey } from "@/lib/payout-crypto-core";

function getKey() {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw?.trim()) throw new Error("PAYOUT_ENCRYPTION_KEY_MISSING");
  return decodePayoutEncryptionKey(raw);
}

export function encryptPayoutData(plaintext: string) {
  return encryptPayoutDataWithKey(plaintext, getKey());
}

export function decryptPayoutData(payload: string) {
  return decryptPayoutDataWithKey(payload, getKey());
}
