import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MAX_ACTION_LENGTH = 100;
const MAX_TARGET_TYPE_LENGTH = 50;
const MAX_TARGET_ID_LENGTH = 128;
const MAX_METADATA_LENGTH = 4000;

type AuditDb = Pick<typeof prisma, "$executeRaw">;

function clean(value: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("INVALID_AUDIT_VALUE");
  return normalized;
}

function prepareAudit(input: {
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const action = clean(input.action, MAX_ACTION_LENGTH);
  const targetType = clean(input.targetType, MAX_TARGET_TYPE_LENGTH);
  const targetId = clean(input.targetId, MAX_TARGET_ID_LENGTH);
  let metadataJson: string | null = null;
  if (input.metadata) {
    metadataJson = JSON.stringify(input.metadata);
    if (metadataJson.length > MAX_METADATA_LENGTH) throw new Error("INVALID_AUDIT_METADATA");
  }
  return { action, targetType, targetId, metadataJson };
}

export async function recordAdminAuditEventInTransaction(
  tx: AuditDb,
  actorUserId: string,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { action, targetType, targetId, metadataJson } = prepareAudit(input);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)) {
    throw new Error("INVALID_AUDIT_ACTOR");
  }

  const id = crypto.randomUUID();
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "AdminAuditLog" ("id", "actorUserId", "action", "targetType", "targetId", "metadataJson", "createdAt")
    VALUES (${id}::uuid, ${actorUserId}::uuid, ${action}, ${targetType}, ${targetId}, ${metadataJson}, CURRENT_TIMESTAMP)
  `);

  return { id, actorUserId, action, targetType, targetId };
}

export async function recordAdminAuditEvent(input: {
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = await requireAdmin();
  return recordAdminAuditEventInTransaction(prisma, admin.id, input);
}
