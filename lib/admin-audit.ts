import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_ACTION_LENGTH = 100;
const MAX_TARGET_TYPE_LENGTH = 50;
const MAX_TARGET_ID_LENGTH = 128;
const MAX_METADATA_LENGTH = 4000;

function clean(value: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("INVALID_AUDIT_VALUE");
  return normalized;
}

export async function recordAdminAuditEvent(input: {
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = await requireAdmin();
  const action = clean(input.action, MAX_ACTION_LENGTH);
  const targetType = clean(input.targetType, MAX_TARGET_TYPE_LENGTH);
  const targetId = clean(input.targetId, MAX_TARGET_ID_LENGTH);
  let metadataJson: string | null = null;
  if (input.metadata) {
    metadataJson = JSON.stringify(input.metadata);
    if (metadataJson.length > MAX_METADATA_LENGTH) throw new Error("INVALID_AUDIT_METADATA");
  }

  const id = crypto.randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AdminAuditLog" ("id", "actorUserId", "action", "targetType", "targetId", "metadataJson", "createdAt")
    VALUES (${id}::uuid, ${admin.id}::uuid, ${action}, ${targetType}, ${targetId}, ${metadataJson}, CURRENT_TIMESTAMP)
  `);

  return { id, actorUserId: admin.id, action, targetType, targetId };
}
