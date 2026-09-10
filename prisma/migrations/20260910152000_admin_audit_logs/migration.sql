CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "targetType" VARCHAR(50) NOT NULL,
  "targetId" VARCHAR(128) NOT NULL,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorUserId_createdAt_idx" ON "AdminAuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_targetType_targetId_createdAt_idx" ON "AdminAuditLog"("targetType", "targetId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminAuditLog_actorUserId_fkey') THEN
    ALTER TABLE "AdminAuditLog"
      ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
