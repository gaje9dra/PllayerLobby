# Phase 6.3 — Final End-to-End Test Plan

## Scope

This plan covers the complete PlayerLobby lifecycle and the reliability/security properties required by Phase 6.3. It deliberately does not add product features, new gateways, new payout providers, or production deployment.

## Current repository test inventory

The repository currently contains focused tests for:

- tournament lifecycle rules
- registration eligibility/workflow
- registration codes
- tournament room rules
- tournament results
- prize rules and prize settlement
- wallet rules
- withdrawal rules
- payout destination validation/encryption
- PayU payment rules
- PayU payout rules
- payout state transitions
- payout reconciliation rules
- security headers
- admin registration rules

The current `npm test` command executes the TypeScript test files under `tests/` through `tsx --test`.

## Test matrix

| Area | Required verification | Current automated coverage | Provider/manual dependency |
|---|---|---|---|
| Authentication | Google login/session/logout/protected-route/suspended/banned/OAuth failure | Existing auth implementation must be exercised in staging | Test Google OAuth + browser/session environment |
| Authorization | User/admin/ownership/API authorization and direct requests | Existing server authorization paths and security tests | Staging/API execution |
| Tournament lifecycle | Valid/invalid configuration and lifecycle transitions | `tournament-lifecycle.test.ts` plus existing admin implementation | Staging workflow |
| Registration | Eligibility, duplicate, closed/started/cancelled cases | `registration-eligibility.test.ts`, `registration-workflow.test.ts` | Staging workflow |
| Payments | Server-derived amount/user/tournament, PayU verification, failure/pending/mismatch/replay | `payu-payment.test.ts` plus payment implementation | PayU sandbox/UAT for provider flow |
| Registration codes | uniqueness, format, invalid/revoked/brute-force cases | `registration-code.test.ts` and Phase 6.1 security controls | Staging/API execution |
| Room access | access window, eligibility, wrong user/code/unpaid cases | `tournament-room.test.ts` plus room implementation | Staging workflow |
| Capacity/concurrency | concurrent registration attempts cannot overbook | Database transaction behavior must be exercised against PostgreSQL | Dedicated test DB |
| Cancellation | existing cancellation/refund behavior remains correct | Existing lifecycle/registration implementation | Staging workflow |
| Results | authorization, participant eligibility, duplicate/finalized-result handling | `tournament-result.test.ts` | Staging workflow |
| Prize settlement | exact allocation, one-time settlement, winner eligibility | `prize-rules.test.ts`, `tournament-prize-settlement.test.ts` | Dedicated test DB |
| Wallet | ledger/balance consistency and idempotency | `wallet-rules.test.ts` plus wallet implementation | Dedicated test DB |
| Withdrawals | reservation, available balance, ownership, cancellation/failure | `withdrawal-rules.test.ts` plus withdrawal implementation | Dedicated test DB |
| Concurrent withdrawals | two simultaneous withdrawals cannot reserve more than balance | Transaction/locking implementation exists; must be executed against PostgreSQL | Dedicated test DB |
| PayU payouts | initiation, provider status, success/failure/reversal/timeout | `payu-payout-rules.test.ts`, `payout-state.test.ts`, `payout-reconciliation-rules.test.ts` | PayU UAT required for provider-side execution |
| Payout webhook | authentication, replay, unknown payout, duplicate event | Payout implementation + reconciliation rules | Staging/API; real provider webhook requires UAT |
| Webhook/reconciliation race | exactly one final accounting transition | State/idempotency implementation; concurrent DB execution required | Dedicated test DB |
| Admin payout controls | authorization, reconciliation/retry/state validation/audit | Existing admin payout implementation | Staging/API execution |
| Security regression | IDOR, privilege escalation, financial manipulation, replay | Phase 6.1 security controls/tests | Staging/API execution |
| API contracts | valid/invalid/auth/role/ownership/type/amount/ID cases | Existing route validation; direct API execution required | Staging/API execution |
| Database integrity | FK/unique/required/enum/rollback/concurrency/migrations | Prisma schema + migrations | Dedicated test DB |
| Failure injection | DB/provider/network/webhook/application restart | Existing recovery/state machinery | Controlled staging environment |
| Restart recovery | pending payment/payout survives restart without duplicate accounting | Persistence design; runtime execution required | Staging environment |
| Audit log | sensitive admin actions recorded without secrets | Phase 6.1 audit implementation | Staging/API execution |
| Load smoke | critical endpoint latency/query/memory sanity | Not a substitute for functional tests | Staging environment |
| Financial invariants | ledger balance, reservation limits, one-time settlement/payout/accounting | Existing wallet/payout/settlement invariants; must be executed end-to-end | Dedicated test DB + UAT for payout |

## Test data policy

Use only a dedicated test/staging PostgreSQL database, test users, test tournaments, and test wallet data. Never use production data or real money. PayU payout tests must use sandbox/UAT credentials only.

## PayU limitation

Repository-level payout tests cannot prove provider-side PayU behavior. A real PayU UAT payout requires an activated PayU payout test merchant, valid UAT credentials, and a reachable webhook URL. Until those are available, provider-side payout execution and webhook delivery are `BLOCKED`, not `PASS`.

## Execution rule

A failed test must be treated as a defect: identify root cause, fix the underlying behavior, add a regression test, rerun the relevant test, then rerun the complete suite when financial/authentication logic is affected. Tests must not be weakened merely to obtain a pass.
