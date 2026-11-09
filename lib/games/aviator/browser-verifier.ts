const ALGORITHM_VERSION = "v2";
const MIN_CRASH = 1.01;
const MAX_CRASH = 120;
const BANDS = [
  { probability: 800, minCents: 101, maxCentsExclusive: 250 },
  { probability: 150, minCents: 250, maxCentsExclusive: 500 },
  { probability: 40, minCents: 500, maxCentsExclusive: 850 },
  { probability: 5, minCents: 850, maxCentsExclusive: 2000 },
  { probability: 4, minCents: 2000, maxCentsExclusive: 4000 },
  { probability: 1, minCents: 4000, maxCentsExclusive: 12000 },
];
const TWO_256 = 1n << 256n;
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
async function uniformIntFromHmac(serverSeed: string, message: string, range: number) {
  const divisor = BigInt(range);
  const limit = TWO_256 - (TWO_256 % divisor);
  for (let attempt = 0; ; attempt += 1) {
    const currentMessage = attempt === 0 ? message : `${message}:retry:${attempt}`;
    const value = BigInt(`0x${await hmacSha256Hex(serverSeed, currentMessage)}`);
    if (value < limit) return Number(value % divisor);
  }
}
export async function verifyAviatorFairnessInBrowser(input: {
  roundId: string; serverSeed: string; serverSeedHash: string; clientSeed: string;
  nonce: string; algorithmVersion: string; crashMultiplier: number;
}) {
  if (input.algorithmVersion !== "v1" && input.algorithmVersion !== ALGORITHM_VERSION) throw new Error("UNSUPPORTED_ALGORITHM_VERSION");
  if (!input.roundId || !input.serverSeed || !input.clientSeed || !input.nonce) throw new Error("INVALID_FAIRNESS_INPUT");
  const computedHash = await sha256Hex(input.serverSeed);
  const base = `${input.clientSeed}:${input.nonce}`;
  let calculatedCrashMultiplier: number;
  if (input.algorithmVersion === "v1") {
    const digest = await hmacSha256Hex(input.serverSeed, base);
    const value = Number.parseInt(digest.slice(0, 8), 16);
    const unit = value / 0x1_0000_0000;
    calculatedCrashMultiplier = Number(Math.min(50, 1.01 + unit * unit * (50 - 1.01)).toFixed(2));
  } else {
    const bucket = await uniformIntFromHmac(input.serverSeed, `${base}:band`, 1000);
    let boundary = 0;
    const band = BANDS.find((candidate) => { boundary += candidate.probability; return bucket < boundary; });
    if (!band) throw new Error("INVALID_CRASH_BUCKET");
    const pointCount = band.maxCentsExclusive - band.minCents;
    const offset = await uniformIntFromHmac(input.serverSeed, `${base}:point`, pointCount);
    calculatedCrashMultiplier = Number(((band.minCents + offset) / 100).toFixed(2));
  }
  const hashValid = computedHash === input.serverSeedHash.toLowerCase();
  const calculationValid = calculatedCrashMultiplier === Number(input.crashMultiplier.toFixed(2));
  return { valid: hashValid && calculationValid, hashValid, calculationValid, computedHash, calculatedCrashMultiplier };
}
