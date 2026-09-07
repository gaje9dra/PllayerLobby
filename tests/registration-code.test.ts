import assert from "node:assert/strict";
import test from "node:test";
import { formatRegistrationCode, isRegistrationCodeFormatValid, normalizeRegistrationCode } from "@/lib/registration-code-rules";

test("registration codes use the canonical grouped format", () => {
  const compact = "ABCD2345EFGH";
  assert.equal(formatRegistrationCode(compact), "ABCD-2345-EFGH");
  assert.equal(isRegistrationCodeFormatValid("ABCD-2345-EFGH"), true);
});

test("registration code normalization accepts case and separators safely", () => {
  assert.equal(normalizeRegistrationCode("abcd-2345-efgh"), "ABCD2345EFGH");
  assert.equal(normalizeRegistrationCode(" ABCD 2345 EFGH "), "ABCD2345EFGH");
  assert.equal(normalizeRegistrationCode("ABCD-2345"), null);
  assert.equal(normalizeRegistrationCode("ABCD-2345-EFG!"), null);
});
