# PlayerLobby Wallet & Ledger Architecture

## Scope

This document describes the Phase 8.1 wallet/ledger foundation and the Phase 8.2 wallet deposit state boundary in PlayerLobby. It intentionally separates payment-provider verification from wallet accounting. PayU checkout, provider webhooks, authoritative payment verification, tournament wallet payments, and new payout logic are outside Phase 8.2.

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
- category (`PRIZE`, `REFUND`, `WITHDRAWAL`, `ENTRY_FEE`, `ADJUSTMENT`, `DEPOSIT`)
- amount
- currency
- reference type
- reference ID
- optional description
- creation timestamp

The reference identifies the business event that caused the accounting movement. Supported references include prize settlements, refunds, withdrawals, entry payments, administrative adjustments, and the future verified deposit credit.

## 4. Idempotency

Wallet ledger creation is idempotent at the business-reference level. The database enforces a unique combination of wallet, reference type, reference ID, direction, and category.

Deposit creation adds a separate request-level idempotency key unique per authenticated user. Retrying the same key with the same amount returns the existing deposit rather than creating another deposit. Reusing the key for a different amount is rejected.

This prevents duplicate deposit records when a request times out or a user submits the same request more than once.

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

## 6. Deposit lifecycle

`WalletDeposit` is the server-side payment-state record used by the Add Money flow. It contains the authenticated user, wallet, exact amount, currency, lifecycle status, non-predictable user-facing reference, optional future provider reference, request idempotency key, and timestamps.

Supported states are:

- `PENDING` — deposit request exists, but payment has not been authoritatively verified.
- `SUCCESS` — reserved for a later authoritative payment-verification workflow.
- `FAILED` — reserved for a later authoritative failed-payment workflow.
- `CANCELLED` — a user may safely cancel a still-pending request before payment completes.

**Creating a deposit does not credit the wallet.** A newly created `PENDING` deposit produces no `WalletTransaction` and leaves `Wallet.balance` unchanged.

The later verified flow must perform:

`verified payment success → SUCCESS deposit state → exactly one CREDIT/DEPOSIT ledger entry → wallet balance update`

Duplicate success processing must return the existing financial reference rather than create another credit. That authoritative verification and credit operation is intentionally not implemented in Phase 8.2.

## 7. Deposit API and ownership

The user-facing creation endpoint is `POST /api/wallet/deposits`. The client supplies only an amount and idempotency key. The server derives the authenticated user, wallet, currency, initial status, and deposit reference.

The authenticated retrieval endpoint is `GET /api/wallet/deposits/:id`. Ownership is resolved from the server-side session; client-supplied `userId` and `walletId` are never trusted. A deposit belonging to another user is not returned.

No endpoint accepts a client-provided successful status, wallet balance, credited amount, or ledger transaction type.

## 8. Deposit limits and abuse controls

Deposit amounts use the same exact-money rules as the wallet. The current technical ceiling is the supported `Decimal(20,2)` storage range and the minimum is ₹1.00. These are centralized in `lib/deposit-rules.ts` so product/provider limits can be changed without rewriting the deposit workflow.

Deposit creation is also protected by the existing database-backed security rate limiter. Rate limiting complements, but does not replace, request idempotency.

## 9. Invariants

The implementation maintains these financial invariants:

1. Wallet balances cannot become negative through the wallet service.
2. Every successful wallet movement has a ledger entry.
3. A ledger entry cannot be duplicated for the same business reference, direction, and category.
4. Wallet and transaction currencies must match the supported wallet currency.
5. Financial amounts have at most two decimal places.
6. Wallet ownership is enforced by the surrounding authenticated service layer.
7. Prize settlement wallet credits execute transactionally with settlement state changes.
8. Withdrawal availability accounts for reserved withdrawal requests and uses wallet row locking for concurrent eligibility checks.
9. `PENDING`, `FAILED`, and newly created `SUCCESS` deposit records do not themselves mutate wallet balance.
10. A verified deposit credit must use one idempotent `DEPOSIT` ledger reference in the later payment-verification phase.

## 10. Reconciliation

`reconcileWallet()` sums all wallet credits and debits and compares the resulting expected balance with the recorded wallet balance.

A wallet is `CONSISTENT` only when:

`recorded balance = total credits - total debits`

Otherwise reconciliation reports `MISMATCH` together with the expected balance, recorded balance, signed difference, and transaction count.

Administrative wallet views expose reconciliation information so accounting discrepancies can be investigated instead of being silently overwritten.

## 11. Security boundaries

Wallet mutation functions are server-only and require administrative authorization for direct credit/debit operations. User-facing wallet reads require an active authenticated user. IDs and financial references are validated before database operations, and descriptions/rejection fields have explicit length limits.

Sensitive payout destination data is not part of the wallet ledger itself.

Deposit references are safe user-facing references; database IDs remain internal. Provider credentials, webhook secrets, and provider-specific sensitive metadata are never exposed through the user deposit API.

## 12. Operational rules

- Do not update wallet balances directly from UI/client code.
- Do not use JavaScript `number` arithmetic for INR monetary values.
- Do not create a wallet transaction without a business reference.
- Do not reuse a financial reference for different amount/currency terms.
- Do not delete or mutate historical wallet transactions to correct an accounting error; use an explicit adjustment/reversal business event.
- Do not mark a deposit `SUCCESS` because a frontend returned from a payment page.
- Do not treat creation of a `PENDING` deposit as payment success.
- Run reconciliation when investigating a financial discrepancy.
- Keep wallet schema migrations additive and reversible where practical; never silently rewrite historical financial records.

## 13. Phase 8.2 boundary

Phase 8.2 implements the Add Money UI, deposit creation, server-backed deposit state retrieval, cancellation of pending requests, ownership checks, idempotency, rate limiting, admin visibility, and ledger integration preparation.

It does **not** integrate PayU, implement PayU callbacks/webhooks, verify provider payments, or credit wallets from payment state. Those behaviors remain outside this phase and must use the existing wallet/ledger architecture when implemented later.
