# PlayerLobby Production Deployment Checklist

This checklist is for controlled production deployment. Never use real production money as part of automated deployment verification.

## Pre-deployment

- [ ] Take and verify a database backup using the hosting/database provider.
- [ ] Confirm point-in-time recovery and retention settings where supported.
- [ ] Set `APP_ENVIRONMENT=production`.
- [ ] Set a production `NEXT_PUBLIC_APP_URL` using HTTPS and the real application domain.
- [ ] Verify the production `DATABASE_URL` points only to the production database.
- [ ] Verify production `AUTH_SECRET` and Google OAuth credentials are production values.
- [ ] Verify Google Authorized JavaScript origins and redirect URIs use the production domain.
- [ ] Verify `PAYU_ENVIRONMENT=production` and production payment credentials.
- [ ] Verify `PAYU_PAYOUT_ENVIRONMENT=PRODUCTION` and production payout credentials.
- [ ] Verify `PAYU_PAYOUT_PRODUCTION_ENABLED=true` only when production payout launch is approved.
- [ ] Verify `PAYOUTS_ENABLED=true` for normal operation, or leave it false while payouts remain intentionally disabled.
- [ ] Verify PayU payment and payout webhook URLs use the production application domain and HTTPS.
- [ ] Verify `PAYOUT_ENCRYPTION_KEY` is present and stored only in the production secret manager/environment.
- [ ] Verify HTTPS termination and forwarded-protocol configuration at the hosting/reverse proxy layer.
- [ ] Verify migrations are committed and `prisma migrate deploy` is the production migration command.
- [ ] Run the production build and automated test suite in a production-like environment.

## Deployment

- [ ] Deploy the reviewed application version through the controlled deployment mechanism.
- [ ] Run `prisma migrate deploy` exactly once for the release.
- [ ] Verify `/api/health` returns only the safe healthy response.
- [ ] Verify Google authentication.
- [ ] Verify tournament browsing and registration in a non-financial test path.
- [ ] Verify PayU payment configuration and callback using the provider's approved test/UAT procedure before enabling production money movement.
- [ ] Verify webhook delivery/authentication.
- [ ] Verify admin authorization.
- [ ] Keep new payouts disabled until production payout configuration and monitoring are approved.

## Post-deployment

- [ ] Verify application logs contain no secrets or sensitive payout data.
- [ ] Verify database connectivity and migration state.
- [ ] Verify PayU webhook delivery and failures are observable.
- [ ] Verify wallet/ledger consistency.
- [ ] Verify withdrawal creation and reservation behavior.
- [ ] Verify payout reconciliation controls.
- [ ] Confirm production monitoring and alerts are active.
- [ ] Enable payouts only after all production payout prerequisites are confirmed.

## Emergency controls

To stop **new** payout money movement without disabling reconciliation/webhooks, set `PAYOUTS_ENABLED=false` in the server environment and restart/redeploy as required by the hosting platform. Existing payout status processing and reconciliation must continue.

Do not manually edit wallet ledger rows. Do not reset the production database. Do not blindly retry an ambiguous payout.

## Manual hosting/provider configuration required

The repository cannot prove these external controls by itself:

- Database backups, retention, point-in-time recovery, and restoration.
- Secret-manager configuration and secret rotation.
- Production DNS, TLS certificates, CDN/reverse-proxy configuration, and forwarded-protocol settings.
- Google OAuth production origins/redirect URIs.
- PayU production/UAT account activation, credentials, payout access, and webhook registration.
- External application/error monitoring and alert delivery.
- Production deployment permissions and approval gates.
