# PlayerLobby Deployment Guide

## Scope

This guide covers controlled deployment of PlayerLobby. It does not claim that external hosting, DNS, TLS, backups, monitoring, Google OAuth production configuration, or PayU provider activation are already configured.

## Prerequisites

- Node.js 22.12+ (22.16+ recommended)
- npm
- PostgreSQL 14+
- Production secret manager/environment configuration
- HTTPS production domain

## Required production environment

Set `APP_ENVIRONMENT=production`, an HTTPS `NEXT_PUBLIC_APP_URL`, production `DATABASE_URL`, production Auth.js/Google OAuth values, PayU payment production values, PayU payout production values, `PAYOUT_ENCRYPTION_KEY`, and the required webhook secrets.

Do not commit secrets. Do not use `NEXT_PUBLIC_*` for server secrets.

Keep new payouts disabled until PayU payout production access, credentials, webhook configuration, reconciliation, and monitoring have been independently approved. `PAYOUTS_ENABLED=false` prevents new payout initiation while webhook/status processing and reconciliation continue.

## Pre-deployment

1. Verify the release commit and CI status.
2. Verify the production database backup/PITR configuration with the database provider.
3. Verify production environment variables in the hosting secret manager.
4. Verify Google OAuth production origin and redirect URI.
5. Verify PayU production/UAT configuration and HTTPS webhook endpoints.
6. Run `npm ci`, `npm run prisma:generate`, `npm run db:validate`, `npm test`, `npm run lint`, and `npm run build` in a production-like environment.

## Database deployment

Use committed migrations only:

```bash
npm run db:migrate:deploy
```

Run this exactly once for the release. Never use `prisma migrate reset` against production.

## Application deployment

Deploy through the hosting provider's controlled release mechanism. Start the application with:

```bash
npm run start
```

Verify `/api/health` returns the safe healthy response. Verify authentication, tournament browsing, a non-financial registration path, admin authorization, and webhook delivery before enabling production money movement.

## PayU

Use the provider's approved UAT/test procedure before production payments. Never use production money in automated tests. Production payout activation requires real provider credentials and approved payout access; until those are available, keep new payouts disabled.

## Rollback

Rollback application code through the hosting provider's controlled mechanism. Confirm the target release supports the current database schema. Do not blindly roll back financial migrations after money movement. Reconcile all in-flight payments and payouts before restoring normal operation.

## External configuration that must be verified manually

- Hosting/deployment permissions and approval gates
- DNS and TLS
- Database backups, retention, PITR, and restore testing
- Secret manager and secret rotation
- Google OAuth production configuration
- PayU payment/payout account activation and credentials
- PayU webhook registration
- External monitoring and alert delivery
