# ROOM_CREDENTIALS — Phase 9.7

## Scope

Phase 9.7 adds private room/lobby credentials to the existing `TournamentBracketMatch` records. It does not replace the wallet, PayU, ledger, registration, authentication, or bracket systems.

## Storage

`MatchRoomCredential` stores one credential set per match. `matchId` is unique, so concurrent admin updates cannot create duplicate active records. Room ID and room password are encrypted at rest with AES-256-GCM using a server-only key derived from `AUTH_SECRET`. Encryption keys are never returned to the browser or committed to Git.

Credentials are logically revoked rather than physically deleted so the audit trail and historical state are preserved.

## Admin workflow

Admin bracket page → Match → **Manage Room**.

Administrators can:

- create credentials
- update credentials
- publish/unpublish credentials
- reveal existing credentials on explicit request
- remove active credentials through logical revocation

The UI masks passwords by default. Admin APIs return only configuration metadata unless `?reveal=1` is explicitly requested by an authorized admin.

## Participant authorization

`GET /api/matches/:matchId/room` is server-authorized. It requires:

- authenticated active user
- existing match and tournament
- non-draft/non-cancelled tournament
- non-completed/non-cancelled match
- confirmed registration in that tournament
- the registration must occupy a slot in that exact match
- active, published, non-revoked room credentials

A user cannot substitute another user ID, registration ID, tournament ID, or client timestamp to bypass these checks.

The final time-based access window is intentionally deferred to Phase 9.9. The authorization service is match-scoped so that a future access-window predicate can be added without changing the credential model or endpoint contract.

## API

Admin:

- `GET /api/admin/matches/:matchId/room`
- `POST /api/admin/matches/:matchId/room`
- `PATCH /api/admin/matches/:matchId/room`
- `DELETE /api/admin/matches/:matchId/room`

Participant:

- `GET /api/matches/:matchId/room`

All credential responses use `Cache-Control: private, no-store, max-age=0`.

Passwords never appear in URLs, audit metadata, application logs, request payloads outside the secure POST/PATCH body, or public tournament/bracket responses. The participant UI keeps credentials in component state only and does not persist them in localStorage, sessionStorage, or cookies.

## Audit logging

Admin create/update/revoke actions record actor, match, tournament, action, and timestamp through the existing admin audit system. Plaintext room ID/password are never written to audit metadata.

## Isolation

Room credential operations do not create registrations, modify registration status, change entry fees, modify brackets, touch wallets, create ledger transactions, invoke PayU, or settle prizes.

## Backward compatibility

Existing matches without credentials remain valid and report `Not Configured`. Existing tournament-level room functionality is left intact for backward compatibility; Phase 9.7's authoritative new credential structure is match-scoped and is the one used by the new match room APIs/UI.

## Future extensions

The match-scoped model can later carry game-specific lobby metadata such as region, lobby type, or mode without changing the core match model. Phase 9.8 adds unique tournament access codes, Phase 9.9 adds the final time window, and Phase 9.10 handles result processing. Those features are intentionally not implemented here.
