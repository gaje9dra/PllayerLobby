import test from "node:test";
import assert from "node:assert/strict";
import { GameValidationError, normalizeGameInput, slugifyGameName } from "@/lib/game-management";

test("game slug generation is deterministic and safe", () => {
  assert.equal(slugifyGameName("Stumble Guys"), "stumble-guys");
  assert.equal(slugifyGameName("Call of Duty: Mobile"), "call-of-duty-mobile");
  assert.equal(slugifyGameName("  Valorant  "), "valorant");
});

test("game input defaults slug and active status", () => {
  assert.deepEqual(normalizeGameInput({ name: "BGMI" }), {
    name: "BGMI",
    slug: "bgmi",
    description: null,
    logoUrl: null,
    isActive: true,
  });
});

test("invalid game names are rejected server-side", () => {
  assert.throws(() => normalizeGameInput({ name: "<script>alert(1)</script>" }), GameValidationError);
  assert.throws(() => normalizeGameInput({ name: "   " }), GameValidationError);
});

test("invalid slugs are rejected", () => {
  assert.throws(() => normalizeGameInput({ name: "Free Fire", slug: "Free Fire" }), GameValidationError);
  assert.throws(() => normalizeGameInput({ name: "Free Fire", slug: "free_fire" }), GameValidationError);
});

test("unsafe logo URLs are rejected", () => {
  assert.throws(() => normalizeGameInput({ name: "Test Game", logoUrl: "javascript:alert(1)" }), GameValidationError);
  assert.throws(() => normalizeGameInput({ name: "Test Game", logoUrl: "data:text/html,hello" }), GameValidationError);
});

test("description and logo URL are normalized safely", () => {
  assert.deepEqual(normalizeGameInput({ name: "Free Fire", slug: "free-fire", description: "Battle royale", logoUrl: "https://example.com/logo.png", isActive: false }), {
    name: "Free Fire",
    slug: "free-fire",
    description: "Battle royale",
    logoUrl: "https://example.com/logo.png",
    isActive: false,
  });
});
