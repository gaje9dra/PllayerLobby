# Tournament Edge Cases — Phase 9.11

Phase 9.11 hardens the existing tournament lifecycle without introducing a second registration, wallet, payment, authentication, bracket, or result system.

## Cancellation

Tournament and match cancellation are status transitions. Historical tournament, registration, match, result, room and audit records are retained. Tournament cancellation changes the tournament to `CANCELLED`, closes active bracket matches, revokes participant access codes, and revokes published match-room credentials. Match cancellation changes an eligible match to `CANCELLED` and revokes its active room credential.

Cancellation requires a non-empty reason, server-side administrator authorization, confirmation in the existing admin UI, a transaction, and an audit event. Repeated cancellation is idempotent.

## Participant cancellation and no-show

Participant cancellation continues to use `Registration.status = CANCELLED`; historical registration/payment records are not deleted. No-show is match-scoped and is stored in `TournamentMatchParticipantState`. Only authorized administrators/operators can mark a participant `NO_SHOW`. No-show does not automatically invent a winner.

Participant room access checks the current registration and match-participant state at request time, so a stale browser cannot bypass cancellation or no-show decisions.

## Abandoned matches

An active `READY` or `LIVE` match may be marked `ABANDONED` by an authorized administrator/operator. Abandonment never selects a winner or advances the bracket. An abandoned match requires explicit later resolution.

## Disputes

Existing Phase 9.10 result disputes remain authoritative. Phase 9.11 adds a controlled dispute-resolution action with an explicit reason and an additional audit event. The original submitted result remains in `MatchResult` history.

## Result correction

A verified result is never silently overwritten. `MatchResultCorrection` stores the previous winner/scores, corrected winner/scores, actor, reason and timestamp before the verified result is updated. The corresponding bracket winner is updated transactionally and the correction is audited.

## Bracket correction

Bracket-slot repair is controlled and administrator-only. The operation validates the tournament and registration, prevents duplicate registration assignment within the tournament, records the previous and corrected slot values in `BracketCorrection`, updates only the requested slot, and writes an audit event. The complete bracket is never regenerated for a local repair.

## State authority and concurrency

All edge-case mutations re-read current database state, use PostgreSQL advisory transaction locks for the affected tournament or match, and use conditional updates where appropriate. Frontend state is never trusted for authorization or lifecycle decisions. Retries are safe for cancellation/no-show actions; result verification continues to use the existing serializable transaction and locking model.

## Missing data and failures

Missing participants and missing room credentials are treated as normal incomplete states. User-facing paths return safe messages rather than SQL errors, stack traces, secret values or internal database errors. Transaction failures roll back the complete edge-case operation.

## Financial isolation

This phase does not refund or credit wallets, change the ledger, modify winnings, or call PayU. Cancellation, no-show, abandonment, dispute and correction operations are operational state changes only. Financial settlement/refund remains a separately controlled workflow.

## Audit events

Important operations emit immutable `AdminAuditLog` entries, including tournament cancellation, match cancellation, no-show, abandonment, dispute resolution, result correction and bracket correction. The dedicated edge-case tables retain structured historical details where an audit event alone would be insufficient for reconstruction.

## Verification commands

CI must execute Prisma generation/validation/migration, lint, typecheck, unit/integration tests, security/authorization tests, bracket tests, concurrency tests, financial regression tests and the production build. Only successful CI output is treated as verification.
