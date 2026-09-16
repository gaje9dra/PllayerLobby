# Tournament Access Flow

Phase 9.9 connects the existing registration, bracket, match-room credential and tournament-access-code systems into one participant joining flow.

## Access timing

The default access window starts **10 minutes before `Tournament.startTime`**. The value is stored in `Tournament.joiningWindowMinutes` (default `10`) so the window can be adjusted without rewriting the access flow.

The server/database is authoritative. The participant page may display timing, but the API performs the actual timing check using PostgreSQL `CURRENT_TIMESTAMP`; if the database time cannot be read, access fails closed. Browser time and client request timestamps are never used as authority.

Before the window opens, access is denied without exposing room credentials. At the opening boundary, an eligible participant can continue. After tournament start, access is not automatically closed. The assigned match must still be in an active joining state (`PENDING`, `READY`, or `LIVE`). Completed/cancelled matches do not expose room credentials.

## Authorization order

1. Require the existing authenticated Google session and an active user.
2. Resolve the requested tournament.
3. Deny cancelled/completed tournaments.
4. Compare database time with the configured joining-window start.
5. Verify the Phase 9.8 tournament access code.
6. Require the user's existing registration to be `CONFIRMED` and scoped to the requested tournament.
7. Resolve the participant's own bracket slot and assigned match on the server.
8. Require an eligible match lifecycle state.
9. Retrieve the existing Phase 9.7 `MatchRoomCredential` only for that match.
10. Return only the assigned match number and decrypted room ID/password.

A code is never sufficient by itself. A registration ID or match ID supplied by the browser is not trusted for authorization, and participants cannot select another match to retrieve another participant's credentials.

## Access-code failures

Invalid, revoked, expired, cross-tournament and otherwise unusable codes produce a generic `Invalid tournament access code.` response. The correct code, partial matches, hashes and room secrets are never returned.

The existing Phase 9.8 security rate limiter is used per authenticated user and tournament.

## Room credentials

Credentials come from the existing Phase 9.7 encrypted `MatchRoomCredential` record. Phase 9.9 does not create or modify room credentials. Missing/unpublished/revoked credentials return:

> Room details are not available yet. Please check again later.

Successful responses use `Cache-Control: private, no-store, max-age=0`.

Passwords are masked by default in the participant UI and can be shown or copied only after the server has returned an authorized response. Credentials are held only in component state; they are not written to `localStorage` or `sessionStorage`, URLs, analytics or SEO metadata.

## Direct URLs and isolation

Sensitive match-room access is available only through the tournament joining flow. Server-side queries bind the authenticated user, tournament, confirmed registration, bracket slot and match together. This prevents cross-user, cross-tournament, cross-registration and cross-match access.

## Audit events

The flow records non-secret security events in the existing audit store:

- `TOURNAMENT_ACCESS_DENIED_STATE`
- `TOURNAMENT_ACCESS_DENIED_TIMING`
- `TOURNAMENT_ACCESS_FAILED`
- `TOURNAMENT_ACCESS_DENIED_ELIGIBILITY`
- `TOURNAMENT_ACCESS_DENIED_MATCH`
- `TOURNAMENT_ACCESS_ROOM_NOT_READY`
- `TOURNAMENT_ACCESS_ROOM_ERROR`
- `TOURNAMENT_ACCESS_SUCCESS`

The access code, room password and encryption key are never placed in audit metadata.

## Financial isolation

Tournament access is read/authorization oriented. It does not debit or credit wallets, create ledger entries, call PayU, modify payments, create or modify registrations, modify bracket assignments, or modify room credentials. Refreshes and repeated access requests remain read-oriented.

## Verification

The repository test suite covers the configured access-window boundary, configurable window behavior, tournament lifecycle rules and participant match lifecycle rules. CI must additionally run Prisma validation/migration, generation, lint, typecheck, unit/integration/security/concurrency/financial-regression tests and the production build before Phase 9.9 is accepted.
