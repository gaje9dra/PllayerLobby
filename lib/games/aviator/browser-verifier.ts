const ALGORITHM_VERSION = "v1";
const MIN_CRASH = 1.01;
const MAX_CRASH = 50;

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  return bytesToHex(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmacSha256Hex(serverSeed: string, message: string) {
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export async function verifyAviatorFairnessInBrowser(input: {
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: string;
  algorithmVersion: string;
  crashMultiplier: number;
}) {
  if (input.algorithmVersion !== ALGORITHM_VERSION) throw new Error("UNSUPPORTED_ALGORITHM_VERSION");
  if (!input.roundId || !input.serverSeed || !input.clientSeed || !input.nonce) throw new Error("INVALID_FAIRNESS_INPUT");

  const computedHash = await sha256Hex(input.serverSeed);
  const digest = await hmacSha256Hex(input.serverSeed, `${input.clientSeed}:${input.nonce}`);
  const value = Number.parseInt(digest.slice(0, 8), 16);
  const unit = value / 0x1_0000_0000;
  const calculatedCrashMultiplier = Number(Math.min(MAX_CRASH, MIN_CRASH + unit * unit * (MAX_CRASH - MIN_CRASH)).toFixed(2));
  const hashValid = computedHash === input.serverSeedHash.toLowerCase();
  const calculationValid = calculatedCrashMultiplier === Number(input.crashMultiplier.toFixed(2));

  return {
    valid: hashValid && calculationValid,
    hashValid,
    calculationValid,
    computedHash,
    hmacDigest: digest,
    calculatedCrashMultiplier,
  };
}
