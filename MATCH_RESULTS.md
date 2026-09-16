# Match Results — Phase 9.10

## Scope

Phase 9.10 establishes the authoritative match-result lifecycle without moving prize money. Existing authentication, registrations, brackets, room credentials, access codes, wallet, ledger, and PayU systems remain separate.

## Lifecycle

`PENDING → VERIFIED | REJECTED | DISPUTED | CANCELLED`

Only `VERIFIED` results become authoritative. A verified result cannot be casually edited; a correction requires a separate authorized workflow in a future phase.

## Submission

The current product architecture has an established admin/operator authorization model but no designated participant result-submission workflow. Therefore Phase 9.10 authorizes administrators/operators to submit results. The API still validates the match, tournament state, participant membership, winner membership, and score shape server-side.

## Verification

Administrators review pending/disputed results. Verification is protected by a per-match PostgreSQL advisory lock and a serializable transaction. The transaction verifies the result, finalizes the current match, advances the winner into the pre-existing next-match slot, and changes the next match to `READY` when both slots are populated.

A conflicting second verification cannot create a second verified result because the database has a partial unique index on `MatchResult(matchId)` for `VERIFIED` rows and the verification transaction locks the match.

## Rejection and disputes

Rejection records a bounded reason. Disputed results do not advance the bracket. Neither action changes wallet, ledger, PayU, registration, or payment records.

## Winner determination

The winner must be one of the match's existing registration slots. The server never accepts an arbitrary user ID as a winner. For a final match, verification writes `Tournament.winnerRegistrationId` and transitions the tournament to `COMPLETED` without creating a financial transaction.

## Bracket advancement

The existing bracket is never regenerated. The winner is written only to the configured `nextMatchId` / `nextSlot`. Existing historical match participation is preserved.

## Authorization and IDOR protection

- Result submission and verification require the existing active-admin authorization.
- Participant result reads are limited to users participating in the match; administrators can read all results.
- `matchId` and `resultId` are cross-checked server-side.
- Winner registration must belong to the match.
- Verification cannot be performed through frontend state alone.

## Audit logging

The existing `AdminAuditLog` is used for result submission, verification, rejection, dispute, winner confirmation, bracket advancement, and final tournament-winner confirmation.

## Financial isolation

This phase does **not**:

- credit winnings
- debit entry fees
- create wallet transactions
- modify the wallet ledger
- call PayU
- create withdrawals
- settle prizes

A later financial phase can consume the verified tournament winner.

## Evidence

The current repository does not contain an existing evidence-upload architecture. Evidence is therefore not made mandatory and no separate storage system is introduced in this phase.

## API

- `POST /api/matches/:matchId/result` — authorized result submission.
- `GET /api/matches/:matchId/result` — participant/admin result history.
- `GET /api/admin/matches/results?tournamentId=:id` — admin review queue.
- `POST /api/admin/matches/:matchId/result/verify` — verify and advance.
- `POST /api/admin/matches/:matchId/result/reject` — reject with reason.
- `POST /api/admin/matches/:matchId/result/dispute` — mark disputed.

## Migration

`20260916210000_match_results` adds `MatchResult` and `Tournament.winnerRegistrationId`. Existing users, tournaments, registrations, brackets, matches, room credentials, access codes, wallets, ledger entries, and payment records are retained.
