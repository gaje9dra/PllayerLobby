# Phase 9.7 — Room ID & Password Management

## Acceptance checklist

- [x] Room credentials belong to existing bracket matches through `MatchRoomCredential.matchId`.
- [x] Admin can configure room ID.
- [x] Admin can configure room password.
- [x] Password is encrypted at rest with AES-256-GCM.
- [x] Encryption key is derived from server-only `AUTH_SECRET` and is never exposed to the client.
- [x] One credential record per match is enforced by a unique database constraint.
- [x] Admin authorization is server-side through existing `requireAdmin()`.
- [x] Admin reveal is explicit and separate from normal metadata reads.
- [x] Participant access is server-side and match-scoped.
- [x] Confirmed registration is required.
- [x] Registration must occupy a slot in the exact requested match.
- [x] Draft/cancelled tournaments are blocked.
- [x] Completed/cancelled matches are blocked.
- [x] Passwords are not placed in URLs.
- [x] Credential responses use `private, no-store` cache controls.
- [x] Plaintext passwords are excluded from audit metadata.
- [x] Credential updates use a transaction and PostgreSQL advisory lock.
- [x] Credential removal is logical revocation so historical records remain available for audit.
- [x] Existing wallet, ledger, PayU, registration, and bracket data are not modified by room operations.
- [x] Existing matches without credentials remain supported as `Not Configured`.
- [x] Participant UI masks passwords by default and does not persist them in browser storage.
- [x] Admin UI masks passwords by default.
- [x] Future time-window enforcement is isolated behind match-room authorization rules and is intentionally deferred to Phase 9.9.
- [x] Unique tournament access codes are not implemented here; they remain Phase 9.8.
- [x] Results, winner verification, and prize distribution are not implemented here; they remain Phase 9.10.
- [x] Security, encryption, authorization-rule, and input-validation tests were added.
- [x] Documentation updated in `ROOM_CREDENTIALS.md`.

## Verification

The repository CI workflow is the source of truth for Prisma generation/validation/migration, TypeScript, lint, tests, and production build. Phase 9.7 is not marked complete until the new workflow run for this implementation is green.
