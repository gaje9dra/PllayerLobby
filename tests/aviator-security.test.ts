import assert from "node:assert/strict";
import test from "node:test";
import { encryptAviatorServerSeed, decryptAviatorServerSeed } from "@/lib/games/aviator/secret";
import { AviatorGameEngine } from "@/lib/games/aviator/engine";

test("aviator server seeds round-trip through authenticated encryption", () => {
  process.env.AUTH_SECRET = "phase-10-3-test-secret";
  const seed = "a".repeat(64);
  const encrypted = encryptAviatorServerSeed(seed);
  assert.notEqual(encrypted, seed);
  assert.equal(decryptAviatorServerSeed(encrypted), seed);
});

test("aviator server seed is not exposed by the public round snapshot", () => {
  const engine = new AviatorGameEngine({ now: () => 1_000 });
  const snapshot = engine.getSnapshot();
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.fairness, "serverSeed"), false);
  assert.equal(snapshot.fairness.serverSeedHash.length, 64);
});
