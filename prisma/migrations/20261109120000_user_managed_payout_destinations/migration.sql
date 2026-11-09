-- Existing user-entered payout methods no longer require an admin verification step.
-- VERIFIED here means selectable in the platform workflow, not independently verified by a bank or UPI provider.
UPDATE "PayoutDestination"
SET "status" = 'VERIFIED',
    "verifiedAt" = COALESCE("verifiedAt", "createdAt")
WHERE "status" = 'PENDING_VERIFICATION';
