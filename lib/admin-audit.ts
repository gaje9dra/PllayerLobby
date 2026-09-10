import "server-only";

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
  let metadataJson: string | undefined;
  if (input.metadata) {
    metadataJson = JSON.stringify(input.metadata);
    if (metadataJson.length > MAX_METADATA_LENGTH) throw new Error("INVALID_AUDIT_METADATA");
  }

  return prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action,
      targetType,
      targetId,
      metadataJson,
    },
    select: { id: true, actorUserId: true, action: true, targetType: true, targetId: true, createdAt: true },
  });
}
