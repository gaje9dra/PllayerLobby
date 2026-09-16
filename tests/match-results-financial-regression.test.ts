import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const servicePath = fileURLToPath(new URL("../lib/match-results.ts", import.meta.url));

test("match result service has no financial mutation dependencies", () => {
  const source = readFileSync(servicePath, "utf8").toLowerCase();
  assert.equal(source.includes("@/lib/wallet"), false);
  assert.equal(source.includes("@/lib/payu"), false);
  assert.equal(source.includes("walletttransaction"), false);
  assert.equal(source.includes("payu"), false);
});
