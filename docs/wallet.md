# Wallet & Ledger Foundation — Phase 5.1

Phase 5.1 establishes a secure wallet and immutable-style financial ledger. `Wallet.balance` is a cached/current balance; the ledger remains the auditable financial source of truth.

## Implemented

- One INR wallet per user with unique `userId`.
- Lazy wallet creation.
- Positive exact-Decimal CREDIT/DEBIT transactions.
- Separate transaction direction, category, and trusted reference type.
- Database uniqueness for financial-event idempotency.
- PostgreSQL row locking plus serializable transactions for balance changes.
- Atomic ledger-entry + cached-balance updates.
- Paginated user transaction history.
- Owner-derived user wallet access.
- ACTIVE ADMIN wallet inspection and reconciliation.
- Reconciliation that reports mismatches without rewriting history.

## Ledger rules

Amounts are positive; DEBIT does not use negative amounts. Currency is explicit and currently constrained to INR. Financial references are server-side UUIDs and cannot be arbitrary client references. Ledger entries have no normal edit or delete operation. Corrections require compensating entries in a future authorized workflow.

## Security boundary

No client-provided balance, user ID, amount, currency, reference, localStorage value, cookie value, URL value, or React state is authoritative. Normal users cannot invoke wallet credit/debit infrastructure or access another user's wallet. Admin wallet pages are protected by the existing `requireAdmin()` authorization.

## Reconciliation

The expected balance is `SUM(CREDIT amounts) - SUM(DEBIT amounts)`. The service compares that value with `Wallet.balance` and reports `CONSISTENT` or `MISMATCH`; it never silently repairs a discrepancy.

## Deliberate exclusions

Phase 5.1 does not implement withdrawals, UPI/bank payouts, PayU payouts, automatic prize payout, refunds, payment transfers, KYC, bank-account storage, UPI-ID storage, arbitrary balance editing, or settlement-to-wallet crediting. Prize settlements remain separate until the future financial integration phase.

## Routes

User wallet: `/dashboard/wallet`

Admin wallet reconciliation: `/admin/finance/wallets`

Admin wallet ledger detail: `/admin/finance/wallets/[walletId]`
