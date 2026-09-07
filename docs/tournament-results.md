# Phase 4.1 — Tournament Results & Winner Management

## Result model

`TournamentResult` belongs to a `Registration`, and each registration can have at most one result. The model stores rank, gameplay score, status, and timestamps. Foreign keys use `ON DELETE RESTRICT` so tournament/registration history cannot be removed through result deletion.

Gameplay score is stored as `Decimal(20,6)` rather than using monetary semantics or binary floating-point storage. Input is restricted to non-negative values with at most six decimal places.

## Status workflow

`DRAFT → VERIFIED`

`DRAFT → DISQUALIFIED`

`VERIFIED → DISQUALIFIED`

There is no normal `VERIFIED → DRAFT` transition. A verified result is official and is not silently editable. Disqualification is an explicit admin action with confirmation.

Result creation always creates `DRAFT`, even if a client attempts to submit another status. Verification and disqualification are separate server-side operations.

## Eligible registrations

Only `CONFIRMED` registrations can receive results. The server loads registration status and tournament relationship from PostgreSQL; browser-supplied status, user ID, payment state, or tournament state is never trusted.

Results can be entered only while the tournament is `LIVE` or `COMPLETED`. The service refreshes tournament lifecycle before checking this condition. DRAFT, UPCOMING, REGISTRATION_OPEN, REGISTRATION_CLOSED, and CANCELLED tournaments cannot receive official results.

## Rank policy

Ranks must be positive integers. Ties are deliberately **not supported** in Phase 4.1, so another `VERIFIED` result with the same tournament/rank blocks verification. Draft results may temporarily contain the same rank while an administrator is preparing them.

## Winner determination

The server exposes official winner candidates through `getWinnerCandidates()`. Candidates are ordered by verified rank and must satisfy all of:

- tournament is LIVE or COMPLETED;
- registration is CONFIRMED;
- result is VERIFIED;
- rank is a positive integer.

This is ranking information only. Phase 4.1 does not calculate prize amounts or perform settlement.

## Admin UI

`/admin/tournaments/[id]/results` is protected by the existing `requireAdmin()` authorization. It displays confirmed participants, result state, rank/score controls, and database-derived summary counts. No registration code, room password, payment secret, or email is exposed outside the authenticated admin page.

Pagination is 20 confirmed participants per page to avoid loading an unbounded participant set into the browser.

## Security

All result operations require an authenticated ACTIVE ADMIN through the existing authorization service. Tournament and registration IDs are validated and cross-checked. A registration from another tournament is rejected. PENDING and CANCELLED registrations are rejected. Cancelled tournaments are rejected. Normal users have no result-submission endpoint.

Verification checks for duplicate verified rank and authoritative result fields from PostgreSQL. Disqualification preserves the result, registration, payment, registration-code, and room history.

## Audit limitation

The project does not currently have a general audit-log subsystem. Phase 4.1 therefore does not introduce a large audit framework. `createdAt`, `updatedAt`, and `resultStatus` preserve the result's current lifecycle state. A future audit system should record result creation, edits, verification, disqualification, actor, and timestamp.

## Scope boundary

This phase intentionally does not implement prize calculation, prize distribution, wallet balances, withdrawals, payouts, refunds, tax calculations, payment settlement, winner payments, game APIs, anti-cheat, public evidence submission, or a broad leaderboard system.
