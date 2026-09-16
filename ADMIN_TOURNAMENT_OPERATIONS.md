# Admin Tournament Operations

Phase 9.12 implementation is tracked in the repository. This document is the operational documentation entry point; implementation must reuse the existing authentication, authorization, tournament, participant, bracket, match, room, access-code, result, dispute, cancellation, wallet, ledger, and PayU systems.

## Security

Admin operations must be authorized server-side. Sensitive room passwords and access codes must remain masked by default and must not be exposed in URLs, logs, analytics, or unauthorised responses. Destructive operations require confirmation, reason, authorization, transactionality where related records change, and audit records.

## Financial isolation

Tournament administration does not implement prize settlement or modify wallet balances, ledger entries, deposits, withdrawals, or PayU transactions.

## Verification

Run the repository's migration, Prisma generation, lint, typecheck, unit/integration/security/concurrency/financial-regression tests, and production build before declaring Phase 9.12 complete.