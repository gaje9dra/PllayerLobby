import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAviatorCrashMultiplier,
  deriveAviatorHmacDigest,
  hashAviatorServerSeed,
  verifyAviatorFairness,
} from "@/lib/games/aviator/provably-fair";

const vector = {
  roundId: "00000000-0000-4000-8000-000000000001",
  serverSeed: "test-server-seed-32-bytes",
  clientSeed: "playerlobby-aviator-v1",
  nonce: "12345",
  algorithmVersion: "v1",
  serverSeedHash: "5e35d1f2f093c39b78b96fc97a7f760ffede7c16eeda6e10d6bcf972a9178d81",
  hmacDigest: "d6af29066075434763cdc07324c87bb0552183d2f3f650b8883dcfb78a500e79",
  crashMultiplier: 35.46,
};

test("provably fair test vector is stable", () => {
  assert.equal(hashAviatorServerSeed(vector.serverSeed), vector.serverSeedHash);
  assert.equal(deriveAviatorHmacDigest(vector), vector.hmacDigest);
  assert.equal(calculateAviatorCrashMultiplier(vector), vector.crashMultiplier);
});

test("same fairness inputs always produce the same result", () => {
  assert.equal(calculateAviatorCrashMultiplier(vector), calculateAviatorCrashMultiplier(vector));
});

test("changing each cryptographic input changes the derived result", () => {
  assert.notEqual(calculateAviatorCrashMultiplier({ ...vector, serverSeed: `${vector.serverSeed}-changed` }), vector.crashMultiplier);
  assert.notEqual(calculateAviatorCrashMultiplier({ ...vector, clientSeed: `${vector.clientSeed}-changed` }), vector.crashMultiplier);
  assert.notEqual(calculateAviatorCrashMultiplier({ ...vector, nonce: "12346" }), vector.crashMultiplier);
});

test("valid fairness data verifies", () => {
  const result = verifyAviatorFairness(vector);
  assert.equal(result.valid, true);
  assert.equal(result.hashValid, true);
  assert.equal(result.calculationValid, true);
});

test("tampered server seed, hash, client seed, nonce and crash result fail verification", () => {
  assert.equal(verifyAviatorFairness({ ...vector, serverSeed: "tampered" }).valid, false);
  assert.equal(verifyAviatorFairness({ ...vector, serverSeedHash: "0".repeat(64) }).valid, false);
  assert.equal(verifyAviatorFairness({ ...vector, clientSeed: "tampered" }).valid, false);
  assert.equal(verifyAviatorFairness({ ...vector, nonce: "99999" }).valid, false);
  assert.equal(verifyAviatorFairness({ ...vector, crashMultiplier: 2.47 }).valid, false);
});

test("unsupported algorithm versions fail safely", () => {
  const result = verifyAviatorFairness({ ...vector, algorithmVersion: "v999" });
  assert.equal(result.valid, false);
  assert.equal(result.message, "Verification unavailable: unsupported algorithm version.");
});
