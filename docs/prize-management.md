# Tournament Prize Management — Phase 4.2

Phase 4.2 defines and records tournament prize allocations without making any payments.

## Data model

`TournamentPrize` belongs to a `Tournament` and represents a monetary allocation for a unique positive tournament rank. The amount uses PostgreSQL `DECIMAL(12,2)`. The prize status is `DRAFT` or `FINALIZED`.

`Tournament.prizePool` remains the authoritative configured pool. Prize rows never point directly to a user; winner matching is performed later from `TournamentResult.rank`.

## Draft workflow

Active admins can add, edit, reorder by changing rank, and remove draft prize positions at `/admin/tournaments/[id]/prizes`.

The server validates every request. Ranks must be positive safe integers and unique within the tournament. Prize amounts must be positive monetary values with at most two decimal places. Draft allocation may be below the pool but may never exceed it.

Totals are recalculated from database values using integer cents (`bigint`), not JavaScript floating-point arithmetic.

## Finalization

Finalization is an explicit admin operation. The server reloads the tournament and all prize rows and requires:

- an existing, non-cancelled tournament;
- at least one prize position;
- valid positive amounts and unique ranks;
- total allocated exactly equal to `Tournament.prizePool`.

All draft rows are atomically changed to `FINALIZED`. Finalized rows cannot be edited or deleted through the ordinary prize-management operations.

The tournament edit operation also blocks changes to `prizePool` while any finalized prize exists, preventing an official allocation from becoming inconsistent with the tournament pool.

## Result integration / preview

`calculateTournamentPrizes(tournamentId)` loads only finalized prize rows and matches each prize rank to a `TournamentResult` whose status is `VERIFIED` and whose registration is `CONFIRMED`.

A missing or disqualified result leaves the corresponding prize position without an eligible participant. No automatic promotion, redistribution, refund, or transfer is performed.

Phase 4.1 does not support ties for official ranks, so Phase 4.2 preserves that behavior and does not invent a tie-splitting policy.

## Public information

The public tournament details page exposes only finalized prize rank/amount pairs. Draft rows and internal identifiers are not exposed. Participant/payment/registration-code/room secrets are not included in public prize data.

## Security

All admin mutations require the existing authenticated, ACTIVE, ADMIN authorization path. Update and delete operations require the requested prize to belong to the requested tournament, preventing cross-tournament IDOR through a mismatched prize ID.

Prize pool, totals, finalized state, rank, amount, and winner identity are never trusted from the client.

## Cancellation and scope

Cancelled tournaments retain prize configuration/history. This phase does not implement wallets, withdrawals, UPI or bank payouts, automatic transfers, PayU payouts, refunds, TDS/tax deduction, settlement, winner payment processing, payout webhooks, or withdrawal verification.
