# Phase 8.9 — Admin Wallet & Financial Management

## Implementation checklist

- [x] Reuse existing ACTIVE ADMIN authorization path; no parallel admin auth system.
- [x] Finance dashboard with server-side wallet/payment/deposit/entry/prize/reconciliation metrics.
- [x] Wallet/user directory with server-side pagination and search by user ID, name, email, or phone.
- [x] Per-wallet read-only ledger inspection and reconciliation.
- [x] Server-side searchable/paginated global wallet transaction ledger.
- [x] Deposit inspection with status/reference/amount filters; no manual success or balance bypass.
- [x] Existing tournament prize settlement and wallet-credit workflow remains authoritative.
- [x] Prize settlement financial mutations are audit logged.
- [x] Existing withdrawal/payout admin mutations are audit logged.
- [x] Controlled wallet adjustments create new ADJUSTMENT ledger entries instead of editing/deleting existing records.
- [x] Adjustment inputs validate direction, positive money, wallet, reason, and idempotency key.
- [x] Adjustment requests are rate limited and idempotent.
- [x] Financial admin audit log viewer with server-side filtering/pagination.
- [x] No admin UI provides direct wallet-balance setting, ledger editing, or ledger deletion.
- [x] Existing server-side authorization is used by all new finance functions.
- [x] Existing payment verification/settlement services remain the only authoritative financial mutation paths for those domains.

## Validation

The repository CI workflow runs Prisma generate/validate/migrations, TypeScript typecheck, lint, tests, and production build on every push to `main`.

Before production sign-off, manually verify as an ACTIVE ADMIN:

1. `/admin/finance` loads.
2. Wallet search and wallet detail work.
3. Transaction filters and pagination work.
4. Deposit filters work.
5. Prize settlement operations remain idempotent and audited.
6. A documented adjustment creates exactly one ADJUSTMENT ledger entry and updates the wallet through the existing transaction service.
7. Reusing the same adjustment idempotency key does not create a second ledger entry.
8. Non-admin users receive the existing access-denied behavior for admin finance pages/actions.
9. Existing PayU deposits, wallet entry payments, prize settlement, withdrawals, and reconciliation regressions pass.
10. Netlify production deployment completes successfully with production database migrations available.

## Scope boundary

Phase 8.10 is intentionally not started by this checklist.
