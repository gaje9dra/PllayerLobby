# Phase 6.2 — Production Infrastructure & Environment Hardening

## Repository findings

- Next.js 16.3.3, Prisma 7.10.0, React 19.2.0 and Node-compatible TypeScript are pinned in the application dependencies. Next.js 16 is an Active LTS line; keep security patches current. The repository now pins Node 22 through `.nvmrc` and `package.json` engines.
- Prisma already uses `prisma migrate deploy` for production-safe migration execution and does not contain a production `migrate reset` command.
- Prisma client creation already reuses the global client in development and creates one server client per process in production; no per-request `PrismaClient` creation was found in the main client module.
- No Docker deployment configuration was present in the inspected repository. No hosting provider was inferred or changed.
- No GitHub Actions workflow existed before this phase; a controlled CI verification workflow is now present.
- No application CORS middleware was found; the application therefore does not intentionally enable wildcard CORS for authenticated APIs.
- No permanent application upload/filesystem storage path was found in the inspected deployment code. Production must still avoid using local disk as durable storage.

## Implemented

- Central server-only environment validation in `lib/env.ts`.
- Explicit `APP_ENVIRONMENT` separation for development, test, staging, and production.
- Production fail-fast validation for database, Google OAuth, PayU payment, PayU payout, encryption, HTTPS application URL, and payout safety configuration.
- Safe production configuration checker: `npm run config:check:production`.
- `.env.example` expanded with safe placeholders and no real credentials.
- `.gitignore` hardened for all `.env.*` files except `.env.example`, build output, coverage and test artifacts.
- Production startup validation through Next.js instrumentation.
- Payout emergency kill switch via `PAYOUTS_ENABLED`; it blocks new payout initiation but does not disable status/webhook/reconciliation processing.
- Safe `/api/health` endpoint returning only `healthy`.
- Request correlation IDs through Next.js Proxy using `x-request-id`.
- Production security headers reviewed and strengthened with CSP, frame protection, HSTS, referrer policy, and permissions policy.
- Node 22 runtime pin.
- CI pipeline covering install, Prisma generation, migration deployment on an ephemeral CI database, typecheck, lint, tests, and production build.
- Production deployment checklist and disaster recovery runbook.

## PayU environment safety

Payments and payouts are both explicitly environment-selected. Production requires production payment and payout environments plus the production payout safety switch. Non-production environments reject production PayU environment selection.

The repository does not contain real PayU credentials.

## Database safety

Production deployment uses committed Prisma migrations and `prisma migrate deploy`. The repository does not automate destructive database reset. Backups, PITR, retention and restoration are provider-level controls and are documented as manual deployment prerequisites rather than claimed as configured.

## Logging and monitoring

Existing financial/security code uses IDs and sanitized audit payloads rather than plaintext payout credentials or full destination data. Minimum production monitoring and alert conditions are documented in `PRODUCTION_RECOVERY.md`. External log aggregation, APM, alert routing and provider monitoring require hosting/provider configuration.

## Webhook and timeout reliability

PayU payout requests already have a 15-second timeout and ambiguous 5xx/timeout outcomes are not automatically retried. Existing merchant-reference reconciliation and idempotency remain authoritative. Webhook processing continues when new payouts are disabled.

## Manual hosting/provider configuration still required

- Production database, backup/PITR, retention and restoration policy.
- Secret manager and secret rotation process.
- Production DNS/TLS/reverse proxy/CDN and forwarded-protocol configuration.
- Google OAuth production origins and redirect URIs.
- PayU UAT/production account activation, credentials and webhook registration.
- External monitoring, alert routing and uptime checks.
- Deployment approval gates and rollback controls.

## Production blockers

The repository is infrastructure-hardened but **not itself proof of production readiness** until the hosting/provider configuration above is completed and the application is exercised in a production-like environment. No real production payout is part of automated verification.
