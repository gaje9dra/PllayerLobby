import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(resolve(root, "app/api/admin/tournaments/[id]/game-config/route.ts"), "utf8");
const actions = readFileSync(resolve(root, "app/admin/tournaments/actions.ts"), "utf8");

test("game configuration API keeps admin authorization and ID checks", () => {
  assert.match(route, /requireAdmin\(\)/);
  assert.match(route, /UUID/);
  assert.match(route, /tournament\.gameId/);
  assert.match(route, /participantCount/);
  assert.doesNotMatch(route, /from ["']@\/lib\/(wallet|payu)/);
});

test("tournament mutations keep game configuration inside server-side validation", () => {
  assert.match(actions, /requireAdmin\(\)/);
  assert.match(actions, /parseGameConfigForm/);
  assert.match(actions, /upsertTournamentGameConfig/);
  assert.match(actions, /TournamentStatus\.DRAFT/);
  assert.doesNotMatch(actions, /wallet\.balance\s*=|walletTransaction\.create/);
});
