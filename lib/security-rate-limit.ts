import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
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
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${keyHash}, 0))`);

    const existing = await tx.securityRateLimit.findUnique({
      where: { keyHash },
      select: { id: true, windowStartedAt: true, requestCount: true },
    });

    if (!existing || now.getTime() - existing.windowStartedAt.getTime() >= windowMs) {
      if (existing) {
        await tx.securityRateLimit.update({
          where: { id: existing.id },
          data: { windowStartedAt: now, requestCount: 1 },
        });
      } else {
        await tx.securityRateLimit.create({
          data: { keyHash, windowStartedAt: now, requestCount: 1 },
        });
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

    await tx.securityRateLimit.update({
      where: { id: existing.id },
      data: { requestCount: { increment: 1 } },
    });

    return {
      allowed: true,
      remaining: Math.max(0, input.limit - existing.requestCount - 1),
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now.getTime() - existing.windowStartedAt.getTime())) / 1000)),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
