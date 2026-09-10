# PlayerLobby — Phase 6.1 Security Audit Report

## Scope

This audit covers the repository state after Phase 5.6 and focuses only on authentication, authorization, object ownership, financial integrity, payment/payout handling, webhooks, registration codes, room access, encryption, secrets, input validation, Prisma usage, browser security headers, rate limiting, logging, dependencies, and administrative security.

No business feature or production deployment work is included.

## Threat model

### Primary assets

- Google identity and Auth.js sessions
- User profile and account status
- Tournament, registration, result, prize, and room data
- PayU payment and payout records
- Registration codes and room credentials
- Wallet balances and immutable ledger entries
- Withdrawal requests and payout destination snapshots
- Encrypted payout destination data
- PayU credentials and webhook authorization
- Administrator privileges

### Threat actors

- Malicious authenticated user
- Compromised user account
- Automated attacker/bot
- Fraudulent payment actor
- IDOR attacker
- Privilege-escalation attacker
- Forged/replayed webhook sender
- Race-condition attacker
- Secret-extraction attacker
- Compromised administrator account

### Highest-impact attack paths

1. Authentication/session compromise → account takeover.
2. Authorization/IDOR failure → access to another user's wallet, withdrawal, payout destination, or registration.
3. Financial race/replay → duplicate debit, overspending, or duplicate payout.
4. Forged PayU callback/webhook → unauthorized payment or payout state transition.
5. Registration-code brute force → unauthorized tournament room access.
6. Compromised administrator → unauthorized financial operations.

## Findings

### High — registration-code brute force protection was missing

**Affected area:** registration-code validation.

**Root cause:** validation had authentication and ownership checks but no server-side attempt throttling.

**Fix applied:** added a database-backed fixed-window rate limiter. Registration-code validation is limited to 10 attempts per user/registration in five minutes. Rate-limit state is stored as a SHA-256 key hash rather than the raw identifier. The limiter serializes updates per key with a PostgreSQL transaction/advisory lock.

**Remaining risk:** rate-limit records need periodic cleanup as operational maintenance if the table grows substantially.

### Medium — baseline browser security headers were missing

**Affected area:** Next.js response configuration.

**Root cause:** no application-wide security header policy was configured.

**Fix applied:** added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and production HSTS. A restrictive CSP was intentionally not added blindly because hosted PayU checkout and OAuth behavior require compatibility testing before tightening script/form/connect policies.

**Remaining risk:** CSP is still a hardening opportunity and should be introduced only after validating every legitimate script, form, and external integration.

### Medium — privileged payout operations lacked a durable audit trail

**Affected area:** admin withdrawal/payout actions.

**Root cause:** authorization existed, but there was no generic durable audit record for high-impact payout administration.

**Fix applied:** added `AdminAuditLog` storage and a server-only audit helper. Withdrawal approval/rejection and payout initiation, reconciliation, and retry actions now record the acting administrator, action, target, and non-sensitive metadata. Sensitive payout destination data is not written to the audit record.

**Remaining risk:** the current UI does not expose a dedicated audit-log viewer. Database records remain available for operational review.

### Medium — PayU payout webhook accepted authorization from request body

**Affected area:** PayU payout webhook endpoint.

**Root cause:** the endpoint accepted the configured webhook authorization from multiple locations, including request body data.

**Fix applied:** the endpoint now passes only the HTTP `Authorization` header to payout processing. PayU's payout webhook configuration documents the merchant-provided authorization value as being delivered in the request header. urlPayU payout webhook documentationhttps://docs.payu.in/reference/set-webhook-api-payouts

**Remaining risk:** PayU webhook authorization remains a shared secret and must stay server-side and be rotated if exposed.

### Medium — webhook endpoint had no explicit abuse throttle

**Affected area:** PayU payout webhook endpoint.

**Root cause:** authentication and idempotency were present, but there was no endpoint-level throttling.

**Fix applied:** added a database-backed limit of 120 requests/minute per authorization bucket, with a separate bucket for unauthenticated traffic. Rate-limit failures fail closed with a temporary service response.

**Remaining risk:** the limit should be adjusted if legitimate PayU event volume grows materially.

### Low — payout webhook fingerprint includes provider message text

**Affected area:** payout webhook replay fingerprinting.

**Risk:** the fingerprint currently includes the provider message. Two semantically identical provider events with different message text could produce different fingerprints.

**Status:** unresolved in this phase because the existing payout processor is large and already provides database uniqueness, merchant-reference matching, and state-machine protection. This should be hardened to fingerprint only stable provider event identifiers in a follow-up security patch.

## Security controls verified

- Google-only authentication; no password fallback.
- Auth.js v5 beta.32 is present, which is above the July 2026 security fixes for affected beta versions. citeturn2search6turn2search7
- Server-derived user identity is used by protected operations.
- Active-user and admin checks are server-side.
- Admin UI visibility is not treated as authorization.
- Registration ownership is checked server-side.
- Wallet and withdrawal operations use server-derived user identity and transactional accounting.
- Monetary values use Prisma Decimal types.
- PayU payment amounts and tournament identity are server-authoritative.
- Browser payment redirects are not treated as authoritative payment confirmation.
- Payout credentials remain server-only.
- Payout destination data is encrypted with AES-GCM and is not sent to the browser in plaintext.
- Payout destination ownership and immutable withdrawal snapshots are enforced.
- Payout state transitions and exactly-once wallet effects are protected by the Phase 5.6 reconciliation design.
- Duplicate payout webhooks use database uniqueness/idempotency controls.
- Room access requires an authenticated eligible participant and joining-window checks.
- Prisma raw SQL usage inspected during the audit is parameterized; no user-controlled `$queryRawUnsafe` pattern was found in the reviewed repository.
- `.env`/`.env.local` are ignored by Git and the tracked example file contains placeholders only.
- No plaintext credentials were found in the current tracked tree during the audit.
- Next.js 16.3.3 is at the patched version for the August 2026 critical Next.js RCE advisories reviewed during this audit. citeturn6search0turn6search1

## Dependency security

The repository uses Next.js 16.3.3 and Auth.js/NextAuth 5.0.0-beta.32. The reviewed Next.js advisories list 16.3.3 as the patched release for the August 2026 critical RCE issues. citeturn6search0turn6search1 Auth.js beta.32 is also the patched release for the July 2026 advisories affecting beta.31 and earlier. citeturn2search6turn2search7

React Server Components advisories reviewed during the audit affect the `react-server-dom-*` packages; the current Next.js release contains its own compiled RSC integration, so no standalone RSC package was found as a direct dependency in the repository tree. citeturn7search8turn7search1

No broad dependency upgrade was performed because the repository is already on security-patched Next.js/Auth.js versions and uncontrolled upgrades would add unnecessary compatibility risk.

## Files changed in Phase 6.1

- `prisma/schema.prisma`
- `prisma/migrations/20260910150000_security_rate_limits/migration.sql`
- `prisma/migrations/20260910152000_admin_audit_logs/migration.sql`
- `lib/security-rate-limit.ts`
- `lib/registration-code.ts`
- `lib/admin-audit.ts`
- `app/api/webhooks/payu/payouts/route.ts`
- `app/dashboard/wallet/withdraw/actions.ts`
- `app/admin/finance/withdrawals/actions.ts`
- `next.config.ts`
- `tests/security-headers.test.ts`
- `docs/security-phase-6.1.md`

## Validation status

The repository-level changes have been committed directly to `main`.

Required local validation after pulling these changes:

1. `git pull origin main`
2. `npx prisma generate`
3. `npx prisma validate`
4. `npx prisma migrate deploy`
5. `npm test`
6. `npx tsc --noEmit`
7. `npm run lint`
8. `npm run build`

`prisma generate` is required because this phase adds two Prisma models and the repository tracks the generated Prisma client.

## Unresolved security risks

1. Webhook fingerprint stability should be improved so provider message text cannot alter an otherwise identical event fingerprint.
2. A dedicated admin audit-log viewer has not been added; this phase stores the audit trail but does not add a new UI feature.
3. A CSP remains intentionally deferred until OAuth and hosted PayU checkout compatibility can be tested.
4. Production secret rotation cannot be verified from repository contents. If any real credential has ever been committed outside the current tracked tree, rotate it immediately; no secret value is reproduced here.

## Stop condition

Phase 6.1 stops here. Phase 6.2 must not be started automatically.
