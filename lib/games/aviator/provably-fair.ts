import { createHash, createHmac, randomBytes } from "node:crypto";

export const AVIATOR_FAIRNESS_ALGORITHM_VERSION = "v1" as const;
export const AVIATOR_FAIRNESS_MIN_CRASH = 1.01;
export const AVIATOR_FAIRNESS_MAX_CRASH = 50;
export const AVIATOR_FAIRNESS_CLIENT_SEED = "playerlobby-aviator-v1";

export type AviatorFairnessCommitment = {
  roundId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: string;
  algorithmVersion: typeof AVIATOR_FAIRNESS_ALGORITHM_VERSION;
};

export type AviatorFairnessSecret = AviatorFairnessCommitment & {
  serverSeed: string;
};

export type AviatorFairnessVerification = {
  valid: boolean;
  hashValid: boolean;
  calculationValid: boolean;
  calculatedCrashMultiplier: number | null;
  message: string;
};

let bootPrefix = BigInt(`0x${randomBytes(8).toString("hex")}`) << 32n;
let nonceCounter = 0n;

export function nextAviatorNonce() {
  const nonce = bootPrefix + nonceCounter;
  nonceCounter += 1n;
  return nonce.toString();
}

export function generateAviatorServerSeed() {
  return randomBytes(32).toString("hex");
}

export function hashAviatorServerSeed(serverSeed: string) {
  return createHash("sha256").update(serverSeed, "utf8").digest("hex");
}

export function deriveAviatorHmacDigest(input: {
  serverSeed: string;
  clientSeed: string;
  nonce: string;
  algorithmVersion?: string;
}) {
  const version = input.algorithmVersion ?? AVIATOR_FAIRNESS_ALGORITHM_VERSION;
  if (version !== AVIATOR_FAIRNESS_ALGORITHM_VERSION) throw new Error("UNSUPPORTED_ALGORITHM_VERSION");
  return createHmac("sha256", input.serverSeed).update(`${input.clientSeed}:${input.nonce}`, "utf8").digest("hex");
}

export function calculateAviatorCrashMultiplier(input: {
  serverSeed: string;
  clientSeed: string;
  nonce: string;
  algorithmVersion?: string;
}) {
  const digest = deriveAviatorHmacDigest(input);
  const value = Number.parseInt(digest.slice(0, 8), 16);
  const unit = value / 0x1_0000_0000;
  const point = AVIATOR_FAIRNESS_MIN_CRASH + unit * unit * (AVIATOR_FAIRNESS_MAX_CRASH - AVIATOR_FAIRNESS_MIN_CRASH);
  return Number(Math.min(AVIATOR_FAIRNESS_MAX_CRASH, point).toFixed(2));
}

export function createAviatorFairnessRound(roundId: string): AviatorFairnessSecret {
  const serverSeed = generateAviatorServerSeed();
  const clientSeed = AVIATOR_FAIRNESS_CLIENT_SEED;
  const nonce = nextAviatorNonce();
  const algorithmVersion = AVIATOR_FAIRNESS_ALGORITHM_VERSION;
  return {
    roundId,
    serverSeed,
    serverSeedHash: hashAviatorServerSeed(serverSeed),
    clientSeed,
    nonce,
    algorithmVersion,
  };
}

export function verifyAviatorFairness(input: {
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: string;
  algorithmVersion: string;
  crashMultiplier: number;
}): AviatorFairnessVerification {
  if (input.algorithmVersion !== AVIATOR_FAIRNESS_ALGORITHM_VERSION) {
    return { valid: false, hashValid: false, calculationValid: false, calculatedCrashMultiplier: null, message: "Verification unavailable: unsupported algorithm version." };
  }
  if (!input.serverSeed || !input.clientSeed || !input.nonce || !input.roundId) {
    return { valid: false, hashValid: false, calculationValid: false, calculatedCrashMultiplier: null, message: "Verification failed: invalid fairness inputs." };
  }
  let calculatedCrashMultiplier: number;
  try {
    calculatedCrashMultiplier = calculateAviatorCrashMultiplier(input);
  } catch {
    return { valid: false, hashValid: false, calculationValid: false, calculatedCrashMultiplier: null, message: "Verification failed: crash calculation could not be reproduced." };
  }
  const computedHash = hashAviatorServerSeed(input.serverSeed);
  const hashValid = computedHash === input.serverSeedHash.toLowerCase();
  const calculationValid = calculatedCrashMultiplier === Number(input.crashMultiplier.toFixed(2));
  return {
    valid: hashValid && calculationValid,
    hashValid,
    calculationValid,
    calculatedCrashMultiplier,
    message: hashValid && calculationValid ? "Result verified." : hashValid ? "Verification failed: crash calculation mismatch." : "Verification failed: server seed hash mismatch.",
  };
}

export function toAviatorFairnessCommitment(secret: AviatorFairnessSecret): AviatorFairnessCommitment {
  return {
    roundId: secret.roundId,
    serverSeedHash: secret.serverSeedHash,
    clientSeed: secret.clientSeed,
    nonce: secret.nonce,
    algorithmVersion: secret.algorithmVersion,
  };
}
