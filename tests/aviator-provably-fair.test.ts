import assert from "node:assert/strict";
import test from "node:test";
import {
  AVIATOR_CRASH_BANDS,
  aviatorCrashBandIndex,
  calculateAviatorCrashMultiplier,
  deriveAviatorHmacDigest,
  hashAviatorServerSeed,
  verifyAviatorFairness,
} from "@/lib/games/aviator/provably-fair";

const vector = {
  roundId: "00000000-0000-4000-8000-000000000001",
  serverSeed: "test-server-seed-32-bytes",
  clientSeed: "playerlobby-aviator-v2",
  nonce: "12345",
  algorithmVersion: "v2",
  serverSeedHash: "",
  hmacDigest: "",
  crashMultiplier: 0,
};
vector.serverSeedHash = hashAviatorServerSeed(vector.serverSeed);
vector.hmacDigest = deriveAviatorHmacDigest(vector);
vector.crashMultiplier = calculateAviatorCrashMultiplier(vector);

test("v2 provably fair test vector is stable", () => {
  assert.equal(hashAviatorServerSeed(vector.serverSeed), vector.serverSeedHash);
  assert.equal(deriveAviatorHmacDigest(vector), vector.hmacDigest);
  assert.equal(calculateAviatorCrashMultiplier(vector), vector.crashMultiplier);
});

test("crash bands encode the exact requested 1,000-bucket distribution", () => {
  assert.deepEqual(AVIATOR_CRASH_BANDS.map((band) => band.probability), [800, 150, 40, 5, 4, 1]);
  assert.equal(AVIATOR_CRASH_BANDS.reduce((total, band) => total + band.probability, 0), 1000);
  const counts = AVIATOR_CRASH_BANDS.map((_, index) => {
    let count = 0;
    for (let bucket = 0; bucket < 1000; bucket += 1) if (aviatorCrashBandIndex(bucket) === index) count += 1;
    return count;
  });
  assert.deepEqual(counts, [800, 150, 40, 5, 4, 1]);
});

test("same fairness inputs always produce the same result", () => {
  assert.equal(calculateAviatorCrashMultiplier(vector), calculateAviatorCrashMultiplier(vector));
});

test("each generated crash result stays inside its assigned multiplier range", () => {
  for (let nonce = 1; nonce <= 500; nonce += 1) {
    const result = calculateAviatorCrashMultiplier({ ...vector, nonce: String(nonce) });
    assert.ok(result >= 1.01 && result < 120);
  }
});

test("valid fairness data verifies", () => {
  const result = verifyAviatorFairness(vector);
  assert.equal(result.valid, true);
  assert.equal(result.hashValid, true);
  assert.equal(result.calculationValid, true);
});

test("tampered fairness inputs and crash result fail verification", () => {
  assert.equal(verifyAviatorFairness({ ...vector, serverSeed: "tampered" }).valid, false);
  assert.equal(verifyAviatorFairness({ ...vector, serverSeedHash: "0".repeat(64) }).valid, false);
  assert.equal(verifyAviatorFairness({ ...vector, clientSeed: "tampered" }).valid, false);
  assert.equal(verifyAviatorFairness({ ...vector, nonce: "99999" }).valid, false);
  assert.equal(verifyAviatorFairness({ ...vector, crashMultiplier: 2.47 }).valid, false);
});

test("v1 algorithm is rejected; only v2 is supported", () => {
  const result = verifyAviatorFairness({ ...vector, algorithmVersion: "v1" });
  assert.equal(result.valid, false);
  assert.equal(result.calculatedCrashMultiplier, null);
  assert.equal(result.message, "Verification unavailable: unsupported algorithm version.");
});

test("unsupported algorithm versions fail safely", () => {
  const result = verifyAviatorFairness({ ...vector, algorithmVersion: "v999" });
  assert.equal(result.valid, false);
  assert.equal(result.message, "Verification unavailable: unsupported algorithm version.");
});
