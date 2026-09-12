import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimitRow = {
  id: string;
  windowStartedAt: Date;
  requestCount: number;
};

function hashKey(namespace: string, key: string) {
  return crypto.createHash("sha256").update(`${namespace}:${key}`, "utf8").digest("hex");
}

export async function consumeSecurityRateLimit(input: {
  namespace: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  if (!Number.isInteger(input.limit) || input.limit <= 0) throw new Error("INVALID_RATE_LIMIT");
  if (!Number.isInteger(input.windowSeconds) || input.windowSeconds <= 0) throw new Error("INVALID_RATE_LIMIT");

  const keyHash = hashKey(input.namespace, input.key);
  const now = new Date();
  const windowMs = input.windowSeconds * 1000;

  return prisma.$transaction(async (tx) => {
    // pg_advisory_xact_lock returns void. Selecting a scalar value from the
    // same advisory-lock function keeps Prisma's $queryRaw deserializer happy
    // while retaining transaction-scoped serialization for this rate-limit key.
    await tx.$queryRaw<{ locked: boolean }[]>(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${keyHash}, 0)) IS NULL AS locked
    `);

    const rows = await tx.$queryRaw<RateLimitRow[]>(Prisma.sql`
      SELECT "id", "windowStartedAt", "requestCount"
      FROM "SecurityRateLimit"
      WHERE "keyHash" = ${keyHash}
      FOR UPDATE
    `);
    const existing = rows[0];

    if (!existing || now.getTime() - existing.windowStartedAt.getTime() >= windowMs) {
      if (existing) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "SecurityRateLimit"
          SET "windowStartedAt" = ${now}, "requestCount" = 1, "updatedAt" = ${now}
          WHERE "id" = ${existing.id}
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "SecurityRateLimit" ("id", "keyHash", "windowStartedAt", "requestCount", "createdAt", "updatedAt")
          VALUES (${crypto.randomUUID()}::uuid, ${keyHash}, ${now}, 1, ${now}, ${now})
        `);
      }
      return { allowed: true, remaining: input.limit - 1, retryAfterSeconds: input.windowSeconds };
    }

    if (existing.requestCount >= input.limit) {
      const elapsedMs = now.getTime() - existing.windowStartedAt.getTime();
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000)),
      };
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "SecurityRateLimit"
      SET "requestCount" = "requestCount" + 1, "updatedAt" = ${now}
      WHERE "id" = ${existing.id}
    `);

    return {
      allowed: true,
      remaining: Math.max(0, input.limit - existing.requestCount - 1),
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now.getTime() - existing.windowStartedAt.getTime())) / 1000)),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
