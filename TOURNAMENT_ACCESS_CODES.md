# Tournament Access Codes

Phase 9.8 adds a separate private credential for tournament access. It is deliberately distinct from registration IDs, registration codes, room credentials, wallet state, and payment state.

## Format

Codes contain 12 cryptographically random characters and are displayed as three groups of four, for example `AB7K-29PX-CDEF`. Ambiguous characters are excluded from the alphabet. Input is normalized to uppercase and optional `-` separators are accepted only for this exact format.

## Storage and security

The database stores a SHA-256 verification hash and an AES-256-GCM encrypted copy for authorized administrator reveal. The encryption key is derived server-side from `AUTH_SECRET`; no key material is sent to the browser. Codes are never placed in normal tournament API responses, URLs, SEO metadata, public HTML, or audit metadata.

## Lifecycle

Each tournament has at most one access-code record (`tournamentId` is unique). A usable tournament may have an `ACTIVE` code. Regeneration atomically replaces the credential and invalidates the previous value. Revocation sets the record to `REVOKED`. `DRAFT`, `CANCELLED`, and `COMPLETED` tournaments cannot be authorized by the participant verification service. The `EXPIRED` state is reserved for future lifecycle integration.

## Admin operations

Authorized administrators can use the admin API/UI to generate or retrieve an existing active code, reveal it, regenerate it, or revoke it. The UI masks the value by default. Reveal is audited without recording the secret itself.

## Verification

`POST /api/tournaments/:tournamentId/access-code/verify` accepts `{ "code": "AB7K-29PX-CDEF" }`. It requires an authenticated active user, a confirmed registration for the specified tournament, an active code, and a usable tournament status. Responses are intentionally generic and never return room credentials or participant data. The endpoint is `private, no-store` and rate limited through the existing security rate limiter.

Phase 9.8 prepares the authorization result for Phase 9.9. It does **not** implement the 10-minute access window, room credential reveal/distribution, match result submission, winner verification, or prize settlement.

## Audit

Generation, regeneration, revocation, and authorized reveal use the existing `AdminAuditLog` transaction/audit path. Secrets and submitted verification codes are not logged.

## Isolation

Access-code operations create zero wallet transactions and do not modify registrations, brackets, matches, room credentials, PayU records, ledger entries, deposits, withdrawals, winnings, or prize settlement state.
