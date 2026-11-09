import { createHash, createHmac, randomBytes } from "node:crypto";

export const AVIATOR_FAIRNESS_ALGORITHM_VERSION = "v2" as const;
export const AVIATOR_FAIRNESS_MIN_CRASH = 1.01;
export const AVIATOR_FAIRNESS_MAX_CRASH = 120;
export const AVIATOR_FAIRNESS_CLIENT_SEED = "playerlobby-aviator-v2";

export const AVIATOR_CRASH_BANDS = [
  { label: "1.01x–2.49x", probability: 800, minCents: 101, maxCentsExclusive: 250 },
  { label: "2.50x–4.99x", probability: 150, minCents: 250, maxCentsExclusive: 500 },
  { label: "5.00x–8.49x", probability: 40, minCents: 500, maxCentsExclusive: 850 },
  { label: "8.50x–19.99x", probability: 5, minCents: 850, maxCentsExclusive: 2000 },
  { label: "20.00x–39.99x", probability: 4, minCents: 2000, maxCentsExclusive: 4000 },
  { label: "40.00x–119.99x", probability: 1, minCents: 4000, maxCentsExclusive: 12000 },
] as const;

export type AviatorFairnessCommitment = {
  roundId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: string;
  algorithmVersion: typeof AVIATOR_FAIRNESS_ALGORITHM_VERSION;
};
export type AviatorFairnessSecret = AviatorFairnessCommitment & { serverSeed: string };
export type AviatorFairnessVerification = {
  valid: boolean; hashValid: boolean; calculationValid: boolean;
  calculatedCrashMultiplier: number | null; message: string;
};

const bootPrefix = ((BigInt(`0x${randomBytes(4).toString("hex")}`) & 0x7fffffffn) | 1n) << 32n;
let nonceCounter = 0n;
const TWO_256 = 1n << 256n;

export function nextAviatorNonce() {
  const nonce = bootPrefix + nonceCounter;
  nonceCounter += 1n;
  return nonce.toString();
}
export function generateAviatorServerSeed() { return randomBytes(32).toString("hex"); }
export function hashAviatorServerSeed(serverSeed: string) { return createHash("sha256").update(serverSeed, "utf8").digest("hex"); }

function hmac(serverSeed: string, message: string) {
  return createHmac("sha256", serverSeed).update(message, "utf8").digest("hex");
}
export function deriveAviatorHmacDigest(input: { serverSeed: string; clientSeed: string; nonce: string; algorithmVersion?: string }) {
  const version = input.algorithmVersion ?? AVIATOR_FAIRNESS_ALGORITHM_VERSION;
  if (version !== AVIATOR_FAIRNESS_ALGORITHM_VERSION) throw new Error("UNSUPPORTED_ALGORITHM_VERSION");
  return hmac(input.serverSeed, `${input.clientSeed}:${input.nonce}`);
}
function digestToBigInt(hex: string) { return BigInt(`0x${hex}`); }

// Rejection sampling avoids modulo bias, so the 1,000 outcome buckets have
// equal probability rather than a subtly biased digest remainder.
function uniformIntFromHmac(input: { serverSeed: string; message: string; range: number }) {
  const range = BigInt(input.range);
  const limit = TWO_256 - (TWO_256 % range);
  for (let attempt = 0; ; attempt += 1) {
    const message = attempt === 0 ? input.message : `${input.message}:retry:${attempt}`;
    const value = digestToBigInt(hmac(input.serverSeed, message));
    if (value < limit) return Number(value % range);
  }
}

export function aviatorCrashBandIndex(bucket: number) {
  if (!Number.isInteger(bucket) || bucket < 0 || bucket >= 1000) throw new Error("INVALID_CRASH_BUCKET");
  let boundary = 0;
  for (let index = 0; index < AVIATOR_CRASH_BANDS.length; index += 1) {
    boundary += AVIATOR_CRASH_BANDS[index].probability;
    if (bucket < boundary) return index;
  }
  throw new Error("INVALID_CRASH_BUCKET");
}

function calculateV1CrashMultiplier(input: { serverSeed: string; clientSeed: string; nonce: string }) {
  const digest = hmac(input.serverSeed, `${input.clientSeed}:${input.nonce}`);
  const value = Number.parseInt(digest.slice(0, 8), 16);
  const unit = value / 0x1_0000_0000;
  return Number(Math.min(50, 1.01 + unit * unit * (50 - 1.01)).toFixed(2));
}
export function calculateAviatorCrashMultiplier(input: { serverSeed: string; clientSeed: string; nonce: string; algorithmVersion?: string }) {
  const version = input.algorithmVersion ?? AVIATOR_FAIRNESS_ALGORITHM_VERSION;
  if (version === "v1") return calculateV1CrashMultiplier(input);
  if (version !== AVIATOR_FAIRNESS_ALGORITHM_VERSION) throw new Error("UNSUPPORTED_ALGORITHM_VERSION");
  const base = `${input.clientSeed}:${input.nonce}`;
  const bucket = uniformIntFromHmac({ serverSeed: input.serverSeed, message: `${base}:band`, range: 1000 });
  const band = AVIATOR_CRASH_BANDS[aviatorCrashBandIndex(bucket)];
  const pointCount = band.maxCentsExclusive - band.minCents;
  const offset = uniformIntFromHmac({ serverSeed: input.serverSeed, message: `${base}:point`, range: pointCount });
  return Number(((band.minCents + offset) / 100).toFixed(2));
}

export function createAviatorFairnessRound(roundId: string): AviatorFairnessSecret {
  const serverSeed = generateAviatorServerSeed();
  return { roundId, serverSeed, serverSeedHash: hashAviatorServerSeed(serverSeed), clientSeed: AVIATOR_FAIRNESS_CLIENT_SEED, nonce: nextAviatorNonce(), algorithmVersion: AVIATOR_FAIRNESS_ALGORITHM_VERSION };
}
export function verifyAviatorFairness(input: { roundId: string; serverSeed: string; serverSeedHash: string; clientSeed: string; nonce: string; algorithmVersion: string; crashMultiplier: number }): AviatorFairnessVerification {
  if (input.algorithmVersion !== "v1" && input.algorithmVersion !== AVIATOR_FAIRNESS_ALGORITHM_VERSION) return { valid: false, hashValid: false, calculationValid: false, calculatedCrashMultiplier: null, message: "Verification unavailable: unsupported algorithm version." };
  if (!input.serverSeed || !input.clientSeed || !input.nonce || !input.roundId) return { valid: false, hashValid: false, calculationValid: false, calculatedCrashMultiplier: null, message: "Verification failed: invalid fairness inputs." };
  let calculatedCrashMultiplier: number;
  try { calculatedCrashMultiplier = calculateAviatorCrashMultiplier(input); } catch { return { valid: false, hashValid: false, calculationValid: false, calculatedCrashMultiplier: null, message: "Verification failed: crash calculation could not be reproduced." }; }
  const computedHash = hashAviatorServerSeed(input.serverSeed);
  const hashValid = computedHash === input.serverSeedHash.toLowerCase();
  const calculationValid = calculatedCrashMultiplier === Number(input.crashMultiplier.toFixed(2));
  return { valid: hashValid && calculationValid, hashValid, calculationValid, calculatedCrashMultiplier, message: hashValid && calculationValid ? "Result verified." : hashValid ? "Verification failed: crash calculation mismatch." : "Verification failed: server seed hash mismatch." };
}
export function toAviatorFairnessCommitment(secret: AviatorFairnessSecret): AviatorFairnessCommitment {
  return { roundId: secret.roundId, serverSeedHash: secret.serverSeedHash, clientSeed: secret.clientSeed, nonce: secret.nonce, algorithmVersion: secret.algorithmVersion };
}
export class ProvablyFairService {
  createRound(roundId: string) { return createAviatorFairnessRound(roundId); }
  calculateCrashMultiplier(input: { serverSeed: string; clientSeed: string; nonce: string; algorithmVersion?: string }) { return calculateAviatorCrashMultiplier(input); }
  verify(input: Parameters<typeof verifyAviatorFairness>[0]) { return verifyAviatorFairness(input); }
}
