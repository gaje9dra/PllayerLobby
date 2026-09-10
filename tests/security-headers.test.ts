import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "@/next.config";

test("security headers include clickjacking and MIME sniffing protections", async () => {
  const groups = await nextConfig.headers?.();
  assert.ok(groups);
  const headers = groups.flatMap((group) => group.headers ?? []);
  const values = new Map(headers.map((header) => [header.key, header.value]));

  assert.equal(values.get("X-Content-Type-Options"), "nosniff");
  assert.equal(values.get("X-Frame-Options"), "SAMEORIGIN");
  assert.equal(values.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(values.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=(), browsing-topics=()");
});
