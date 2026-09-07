# Tournament Rooms — Phase 3.4

## Access rule

Participant room access is server-controlled:

`ACTIVE user + own CONFIRMED registration + matching registration code + joinable tournament + joining window open + published/non-revoked room`

The joining window is:

`startTime - joiningWindowMinutes <= now < startTime`

Server/database time is authoritative. The browser cannot supply a timestamp or status to bypass the rule.

## Room storage

Room ID and room password are encrypted at rest with AES-256-GCM. The encryption key is derived from the existing server-only `AUTH_SECRET`. Plaintext credentials are never stored in the public tournament model or returned until all participant checks have passed.

No room credentials are placed in URLs, public metadata, public tournament queries, logs, localStorage, or public cacheable responses.

## Admin management

`/admin/tournaments/[id]/room` uses the existing server-side `requireAdmin()` authorization. Create/update/revoke operations repeat authorization on the server and verify the tournament exists. One room record is permitted per tournament through a database unique constraint.

Completed and cancelled tournaments cannot have active room credentials published. Existing room records are preserved for audit/history.

## Participant API

`POST /api/tournaments/[tournamentId]/room` accepts only the registration ID and registration code needed to authenticate the participant's registration. It never accepts user ID, registration status, payment status, tournament status, or client time as authority.

Successful responses use `Cache-Control: private, no-store, max-age=0`. Errors return friendly messages without internal database details.

## Public page

The public tournament page contains no room credentials. Confirmed participants receive only a link to the protected join flow. The join flow asks for the registration code and obtains credentials through the protected API only after the server checks all authorization and timing requirements.

## Phase boundary

This phase intentionally does not implement match results, leaderboards, scoring, payouts, refunds, game APIs, automated room creation, or player result submission.
