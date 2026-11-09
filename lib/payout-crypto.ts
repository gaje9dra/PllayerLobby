import "server-only";

import { decryptPayoutDataWithKey, encryptPayoutDataWithKey } from "@/lib/payout-crypto-core";

const KEY_LENGTH = 32;

function getKey() {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("PAYOUT_ENCRYPTION_KEY_MISSING");

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH || key.toString("base64") !== raw) {
    throw new Error("PAYOUT_ENCRYPTION_KEY_INVALID");
  }
  return key;
}

export function encryptPayoutData(plaintext: string) {
  return encryptPayoutDataWithKey(plaintext, getKey());
}

export function decryptPayoutData(payload: string) {
  return decryptPayoutDataWithKey(payload, getKey());
}
