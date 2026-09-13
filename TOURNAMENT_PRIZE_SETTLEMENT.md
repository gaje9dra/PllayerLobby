# Tournament Prize Settlement — Phase 8.6

Phase 8.6 credits finalized tournament prizes to the winner's existing PlayerLobby wallet.

## Financial flow

`TOURNAMENT COMPLETED → VERIFIED RESULTS → FINALIZED PRIZES → PENDING SETTLEMENT → APPROVED → WALLET CREDIT + PRIZE LEDGER → CREDITED`

Approval and wallet credit are separate deliberate operations.

## Authority

The server is authoritative for:

- tournament state
- verified winner/result
- prize configuration
- settlement amount
- currency
- registration
- recipient wallet
- settlement status

Client input cannot select a different winner, wallet, amount, currency, or ledger reference.

## Settlement generation

An administrator can generate settlements only when:

1. the tournament is `COMPLETED`;
2. prize configuration exists;
3. every configured prize is `FINALIZED`;
4. the finalized prize allocation equals the tournament prize pool;
5. a matching verified result and confirmed registration exist.

The database uniqueness constraints make settlement generation repeatable.

## Approval

A settlement starts as `PENDING`. Approval is explicit and moves it to `APPROVED`. Approval alone never changes the wallet balance.

Before approval the server revalidates the tournament, prize, result, registration, rank, amount and currency.

## Wallet credit

`creditApprovedPrizeSettlement(settlementId)` is server-only and requires an active admin. It derives the recipient through:

`settlement → registration → user → wallet`

The service locks the settlement, validates all financial relationships, locks the wallet, creates the unique `CREDIT + PRIZE` wallet transaction with `PRIZE_SETTLEMENT` reference data, updates the wallet balance, and marks the settlement `CREDITED` inside one serializable database transaction.

No separate winnings wallet exists.

## Idempotency

A successful settlement is uniquely represented by the settlement reference. The wallet ledger also enforces uniqueness for the wallet/reference/type/category combination.

If the same settlement is submitted again after it is correctly `CREDITED`, the service returns the existing credit without adding money again.

## Concurrency

Concurrent settlement attempts are protected by settlement row locking, wallet row locking, database uniqueness and serializable transactions.

The intended invariant is:

`₹1,000 prize + two simultaneous settlement requests = exactly ₹1,000 credited once.`

## Failure handling

Any failure during the financial transaction rolls back the wallet and ledger changes. An uncertain operation must never be represented as successful.

A settlement that is `CREDITED` but has no matching wallet credit is treated as a financial reconciliation failure rather than silently creating or deleting historical money.

## Reconciliation

The admin settlement page checks for:

- approved settlement without credit;
- credited settlement without matching credit;
- credit attached to a non-credited settlement;
- amount mismatch;
- currency mismatch;
- settlement/result/prize/registration relationship mismatch.

Reconciliation does not silently rewrite historical financial records.

## Result corrections

Verified results that have an active settlement cannot be changed in a way that would invalidate the financial record. A result that has already produced a wallet credit cannot be disqualified or silently replaced.

## User visibility

After successful credit, the existing wallet history shows the `PRIZE` credit and tournament/rank description. The completed tournament can show the user's placement and prize only after the server confirms the settlement.

## Out of scope

Phase 8.6 does not implement:

- withdrawals;
- bank/UPI payout;
- PayU payout;
- refunds;
- a second wallet;
- a second ledger;
- arbitrary admin wallet credits.

## Verification commands

Run against the configured PostgreSQL test database:

```text
npm run prisma:generate
npm test
npm run lint
npm run build
```

Do not mark the phase fully verified until the database-backed tests and production build have actually run successfully in the target environment.
