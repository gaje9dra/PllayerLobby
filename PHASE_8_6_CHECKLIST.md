# PHASE 8.6 — TOURNAMENT PRIZE SETTLEMENT → WALLET

## Status

**IMPLEMENTED** — Phase 8.6 is present in the current `main` branch.

## Implementation checklist

- [x] Existing tournament result system reused.
- [x] Settlement records use `TournamentPrizeSettlement`.
- [x] Only `COMPLETED` tournaments can generate/credit settlements.
- [x] Verified results are required before settlement.
- [x] Prize configuration must be `FINALIZED`.
- [x] Confirmed registration is required for the winner.
- [x] Winner, wallet, amount and currency are derived server-side.
- [x] Settlement amount must match the authoritative prize amount.
- [x] Settlement currency is restricted to INR.
- [x] Admin authorization is required for settlement operations.
- [x] Settlement approval is explicit; approval does not credit the wallet.
- [x] Wallet credit uses the existing PlayerLobby wallet.
- [x] No separate winnings wallet is created.
- [x] Wallet credit and ledger entry are performed atomically.
- [x] `PRIZE_SETTLEMENT` reference identifies the settlement.
- [x] Database uniqueness prevents duplicate wallet credits.
- [x] Settlement row locking protects concurrent credit attempts.
- [x] Serializable transaction handling protects concurrent settlement credit.
- [x] Repeated credit requests are idempotent when the settlement is already correctly credited.
- [x] Failed financial operations roll back.
- [x] Wallet/settlement reconciliation is implemented.
- [x] Admin settlement UI exposes pending/approved/credited/cancelled states.
- [x] User wallet history receives the prize ledger transaction.
- [x] Result correction is blocked once a settlement has been credited.
- [x] Prize amount and winner are not accepted from the client as authoritative financial values.
- [x] Withdrawals and external bank/UPI payout are outside this phase.

## Database

The schema contains:

- `TournamentPrizeSettlement`
- `TournamentPrizeSettlementStatus`: `PENDING`, `APPROVED`, `CREDITED`, `CANCELLED`
- unique `prizeId`
- unique `resultId`
- wallet transaction uniqueness across wallet/reference/type/category

The corresponding Prisma migrations are already present.

## Main implementation files

- `lib/tournament-prize-settlement.ts`
- `lib/prize-settlement-wallet.ts`
- `lib/prize-settlement-wallet-reconciliation.ts`
- `lib/tournament-prize-settlement-rules.ts`
- `app/admin/tournaments/[id]/settlements/page.tsx`
- `app/admin/tournaments/[id]/settlements/actions.ts`
- `tests/tournament-prize-settlement.test.ts`

## Financial invariant

For a successful prize settlement:

`finalized result → approved settlement → existing user wallet → PRIZE wallet transaction → CREDITED settlement`

The wallet credit and settlement state transition occur in the same database transaction. A retry must not create a second prize credit.

## Validation note

The repository currently contains both unit-level settlement rule tests and the production settlement implementation. Full database-backed settlement execution must be validated against the configured PostgreSQL test database before claiming the end-to-end settlement test suite has passed.

**Phase 8.7 must not be started as part of this checklist.**
