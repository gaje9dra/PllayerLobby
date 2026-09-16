import test from "node:test";
import assert from "node:assert/strict";
import { createTournamentAccessCodeData, formatTournamentAccessCode, hashTournamentAccessCode, normalizeTournamentAccessCode } from "@/lib/tournament-access-code";

test("access code generation is human-readable and has 12 non-ambiguous characters", () => {
  const generated = createTournamentAccessCodeData();
  assert.match(generated.code, /^[A-HJ-NPQRTUVWXYZ2346789]{4}-[A-HJ-NPQRTUVWXYZ2346789]{4}-[A-HJ-NPQRTUVWXYZ2346789]{4}$/);
  assert.equal(generated.codeHash.length, 64);
  assert.ok(generated.codeEncrypted.includes("."));
});

test("normalization accepts case and optional group separators only", () => {
  assert.equal(normalizeTournamentAccessCode("ab7k-29px-cdef"), "AB7K29PX CDEF".replace(" ", ""));
  assert.equal(normalizeTournamentAccessCode("AB7K29PXCDEF"), "AB7K29PXCDEF");
  assert.equal(normalizeTournamentAccessCode("AB7K/29PX/CDEF"), "");
  assert.equal(normalizeTournamentAccessCode("AB7K-29PX"), "");
});

test("hashing is stable across supported formatting and case", () => {
  assert.equal(hashTournamentAccessCode("ab7k-29px-cdef"), hashTournamentAccessCode("AB7K29PXCDEF"));
  assert.equal(hashTournamentAccessCode("AB7K29PXCDEF")?.length, 64);
});

test("formatting creates the documented three groups", () => {
  assert.equal(formatTournamentAccessCode("AB7K29PXCDEF"), "AB7K-29PX-CDEF");
});

test("generation produces distinct random credentials in a small sample", () => {
  const codes = new Set(Array.from({ length: 20 }, () => createTournamentAccessCodeData().code));
  assert.equal(codes.size, 20);
});
