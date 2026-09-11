# PlayerLobby Wallet & Ledger Architecture

## Scope

This document describes the Phase 8.1 wallet/ledger foundation already present in PlayerLobby. It is intentionally limited to wallet accounting and its invariants. Payment-provider deposits, payout execution, production deployment, and UI changes are outside this document.

## 1. Financial source of truth

`Wallet` is the current balance snapshot for one user. Each user has at most one wallet (`userId` is unique). `WalletTransaction` is the immutable accounting ledger for wallet movements.

A wallet balance is therefore a materialized running total, while the ledger is the audit trail used to reconstruct and reconcile that total.

The database uses PostgreSQL `Decimal(20, 2)` for wallet balances and transaction amounts. Currency is stored explicitly and the current wallet currency is INR.

## 2. Money representation

Application-level money arithmetic is performed as integer cents using `BigInt` in `lib/wallet-rules.ts`. Inputs are normalized to exactly two decimal places and rejected when they contain more than two decimals, invalid syntax, or negative values where a positive amount is required.

This avoids JavaScript floating-point arithmetic for financial calculations.

Core operations:

- `normalizeMoney()` — validates and canonicalizes a monetary value.
- `addMoney()` — exact cent addition.
- `subtractMoney()` — exact non-negative subtraction.
- `compareMoney()` — exact comparison.

## 3. Ledger entry model

Every wallet movement records:

- wallet ID
- direction (`CREDIT` or `DEBIT`)
- category (`PRIZE`, `REFUND`, `WITHDRAWAL`, `ENTRY_FEE`, `ADJUSTMENT`)
- amount
- currency
- reference type
- reference ID
- optional description
- creation timestamp

The reference identifies the business event that caused the accounting movement. Supported references include prize settlements, refunds, withdrawals, entry payments, and administrative adjustments.

## 4. Idempotency

Wallet ledger creation is idempotent at the business-reference level. The database enforces a unique combination of wallet, reference type, reference ID, direction, and category.

Before creating a ledger entry, the service checks for an existing matching reference. A repeated request returns the existing entry when amount and currency match. Reuse of an existing reference with different financial terms is rejected.

This prevents duplicate credits/debits when an upstream operation is retried.

## 5. Atomic balance updates

Ledger creation and balance mutation occur inside the same Prisma database transaction.

The wallet row is explicitly locked with PostgreSQL `SELECT ... FOR UPDATE` before the current balance is read. The transaction then:

1. locks the wallet;
2. validates currency and transaction parameters;
3. checks for an existing ledger entry;
4. calculates the next balance using exact cent arithmetic;
5. rejects a debit that would make the balance negative;
6. creates the ledger entry;
7. updates the wallet balance.

The transaction uses Prisma `Serializable` isolation. Consequently, a successful ledger entry and its balance update commit together, while concurrent conflicting operations are retried/failed by the database rather than silently overwriting one another.

## 6. Invariants

The implementation maintains these financial invariants:

1. Wallet balances cannot become negative through the wallet service.
2. Every successful wallet movement has a ledger entry.
3. A ledger entry cannot be duplicated for the same business reference, direction, and category.
4. Wallet and transaction currencies must match the supported wallet currency.
5. Financial amounts have at most two decimal places.
6. Wallet ownership is enforced by the surrounding authenticated service layer.
7. Prize settlement wallet credits execute transactionally with settlement state changes.
8. Withdrawal availability accounts for reserved withdrawal requests and uses wallet row locking for concurrent eligibility checks.

## 7. Reconciliation

`reconcileWallet()` sums all wallet credits and debits and compares the resulting expected balance with the recorded wallet balance.

A wallet is `CONSISTENT` only when:

`recorded balance = total credits - total debits`

Otherwise reconciliation reports `MISMATCH` together with the expected balance, recorded balance, signed difference, and transaction count.

Administrative wallet views expose reconciliation information so accounting discrepancies can be investigated instead of being silently overwritten.

## 8. Existing integrations

Prize settlement credits use the wallet ledger and protect against duplicate settlement credits. Withdrawal logic uses the same exact-money helpers and wallet row locking while calculating reserved and available balances.

The payout-destination requirement remains intentionally enforced elsewhere. Phase 8.1 does not bypass or replace that requirement.

## 9. Security boundaries

Wallet mutation functions are server-only and require administrative authorization for direct credit/debit operations. User-facing wallet reads require an active authenticated user. IDs and financial references are validated before database operations, and descriptions/rejection fields have explicit length limits.

Sensitive payout destination data is not part of the wallet ledger itself.

## 10. Operational rules

- Do not update wallet balances directly from UI/client code.
- Do not use JavaScript `number` arithmetic for INR monetary values.
- Do not create a wallet transaction without a business reference.
- Do not reuse a financial reference for different amount/currency terms.
- Do not delete or mutate historical wallet transactions to correct an accounting error; use an explicit adjustment/reversal business event.
- Run reconciliation when investigating a financial discrepancy.
- Keep wallet schema migrations additive and reversible where practical; never silently rewrite historical financial records.

## 11. Phase 8.1 boundary

This architecture is the accounting foundation. It does not authorize or implement real-money payment-provider behavior by itself. Deposit processing, payout execution, provider webhooks, and production credentials remain separate workflows and must continue to use the wallet ledger through controlled, idempotent business events.
