# Phase 5.2 — Prize Settlement → Wallet Credit

Phase 5.2 connects an APPROVED `TournamentPrizeSettlement` to the winner's PlayerLobby wallet.

## State flow

`PENDING → APPROVED → CREDITED`

`CREDITED` means the settlement was approved, the winner's wallet was identified server-side, a `PRIZE`/`CREDIT` ledger transaction referencing the settlement was created, the cached wallet balance was updated, and the settlement status was changed to `CREDITED` in the same database transaction.

`CREDITED` is not an external payout.

## Atomic operation

`creditApprovedPrizeSettlement(settlementId)` is server-only and requires an active admin. It derives the recipient from `settlement → registration → user → wallet`; it does not accept a user ID, wallet ID, email, amount, currency, or status from the client.

The service locks the settlement row, validates tournament/prize/result/registration eligibility, creates or retrieves the user's INR wallet, verifies currency and authoritative settlement amount, locks the wallet, creates the unique ledger credit, updates the cached balance, and marks the settlement `CREDITED` in one serializable transaction.

Any failure rolls back the financial changes.

## Idempotency and concurrency

The settlement row is locked with `FOR UPDATE`, and the wallet ledger uses the existing unique financial reference key. A `PRIZE_SETTLEMENT` credit references the settlement UUID with `CREDIT` + `PRIZE`. Replays cannot create a second credit. Concurrent requests are handled with PostgreSQL row locking and serializable transactions.

## Reconciliation

Settlement-wallet reconciliation reports:

- APPROVED settlement without a wallet credit
- CREDITED settlement without a wallet credit
- wallet credit with a non-CREDITED settlement
- amount mismatch
- currency mismatch

It does not automatically alter historical financial records or balances.

## Admin UI

The settlement page shows:

- PENDING / APPROVED / CREDITED / CANCELLED totals
- approved, credited, pending, and cancelled amounts
- `Credit ₹X to Wallet` for APPROVED settlements only
- explicit confirmation that the credit remains inside the PlayerLobby wallet and is not a bank/UPI transfer
- `Credited` state after success
- wallet-credit reconciliation results

## User wallet

The existing `/dashboard/wallet` history displays the resulting `PRIZE` credit and its tournament/rank description after the credit is committed.

## Exclusions

Phase 5.2 does not implement withdrawals, bank/UPI payouts, external payout providers, refunds, KYC, bank-account storage, UPI-ID storage, or manual wallet balance editing.
