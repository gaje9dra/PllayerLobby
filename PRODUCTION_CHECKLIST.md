# PlayerLobby Final Production Checklist

This checklist records what must be verified before launch. A checked item means it has actually been verified; external provider/hosting controls cannot be marked checked from repository inspection alone.

## Pre-launch

### Infrastructure
- [ ] Production hosting configured
- [ ] HTTPS enabled
- [ ] Production domain/DNS configured
- [ ] Production database configured
- [ ] Database backups/PITR verified with provider
- [ ] Monitoring and alerting verified

### Authentication
- [ ] Google OAuth production origin and redirect URI verified
- [ ] Production session configuration verified
- [ ] Admin access verified server-side

### Payments
- [ ] PayU production account configured
- [ ] Production payment credentials stored securely
- [ ] Payment callback/webhook configured over HTTPS
- [ ] Payment verification tested through approved UAT/provider procedure

### Payouts
- [ ] PayU payout production access approved
- [ ] Production payout credentials secured
- [ ] Payout webhook configured
- [ ] Reconciliation path verified
- [ ] Emergency payout kill switch verified
- [ ] New payouts remain disabled until all payout prerequisites are approved

### Database
- [ ] All committed migrations verified on a clean test database
- [ ] Production backup verified with provider
- [ ] Restore procedure documented and tested in an isolated environment

### Security
- [ ] No secrets in Git
- [ ] Dependency audit reviewed
- [ ] Authorization verified server-side
- [ ] Rate limits verified on relevant sensitive operations
- [ ] Security headers verified
- [ ] Sensitive logging reviewed

### Application
- [ ] Production build passes
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Unit tests pass
- [ ] Integration tests pass where available
- [ ] E2E tests pass where available
- [ ] Financial invariants pass

### UX
- [ ] Mobile critical flows checked
- [ ] Desktop critical flows checked
- [ ] Accessibility checked
- [ ] Error states checked
- [ ] Loading states checked

### SEO
- [ ] Sitemap verified
- [ ] Robots configuration verified
- [ ] Public metadata verified
- [ ] Private/public indexing boundaries reviewed

## Launch

- [ ] Deploy the reviewed commit through controlled hosting
- [ ] Run `npm run db:migrate:deploy` once for the release
- [ ] Verify `/api/health`
- [ ] Verify Google authentication
- [ ] Verify tournament browsing and a non-financial registration path
- [ ] Verify approved PayU UAT/payment callback procedure
- [ ] Verify webhook authentication and delivery
- [ ] Verify admin authorization
- [ ] Keep new payouts disabled until production payout prerequisites are complete

## Post-launch

- [ ] Verify logs contain no secrets or sensitive payout data
- [ ] Verify database connectivity and migration state
- [ ] Verify payment and payout failures are observable
- [ ] Verify wallet/ledger consistency
- [ ] Verify withdrawal reservation behavior
- [ ] Verify payout reconciliation
- [ ] Confirm monitoring/alerts are active
- [ ] Enable new payouts only after production payout approval

## Current known external blockers

The repository cannot verify hosting/provider configuration. Production launch must remain **NO-GO** until the operator verifies production hosting, HTTPS/domain, database backup/restore, Google OAuth production configuration, PayU production/UAT activation, payment webhooks, payout credentials/access, payout webhook, reconciliation monitoring, and required provider-side tests.
