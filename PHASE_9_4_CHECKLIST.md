# Phase 9.4 — Tournament Scheduling & Lifecycle Checklist

## Lifecycle

- [x] Centralized lifecycle states and transition rules.
- [x] DRAFT remains admin-published only.
- [x] UPCOMING transitions to REGISTRATION_OPEN at the configured opening time.
- [x] REGISTRATION_OPEN transitions to REGISTRATION_CLOSED at the configured closing time.
- [x] REGISTRATION_CLOSED transitions to LIVE at the configured tournament start time.
- [x] LIVE does not auto-complete without an authoritative end time.
- [x] CANCELLED is terminal for automatic lifecycle processing.
- [x] Invalid lifecycle transitions are rejected server-side.

## Scheduling

- [x] New tournaments cannot be scheduled entirely in the past.
- [x] Registration start/end/start ordering is validated server-side.
- [x] Existing timezone parsing is reused.
- [x] Lifecycle comparisons use server-side timestamps.
- [x] Browser countdowns are display-only.
- [x] Schedule changes are protected after participant activity.
- [x] Active/finalized tournaments have their schedule locked.

## Registration

- [x] Registration uses `now >= registrationStartTime && now < registrationEndTime`.
- [x] Registration refreshes lifecycle state before entering the transaction.
- [x] Registration re-checks the authoritative time inside the transaction.
- [x] Tournament row locking protects close-time races.
- [x] Maximum participant capacity is enforced server-side.
- [x] FULL is represented as derived availability, not a duplicate lifecycle status.

## Automation & recovery

- [x] Protected lifecycle API exists.
- [x] Netlify Scheduled Function runs every minute in production.
- [x] Scheduler authenticates with `CRON_SECRET`.
- [x] Scheduler uses `CRON_ACTOR_USER_ID` for durable SYSTEM audit records.
- [x] Automatic status update and SYSTEM audit record are transactional.
- [x] No browser/in-memory timer is required.
- [x] Conditional status updates are idempotent under concurrent execution.
- [x] Missed transitions are caught up on later scheduler runs.
- [x] Server restart does not lose lifecycle scheduling.

## Security & data integrity

- [x] Admin lifecycle actions use existing `requireAdmin()` authorization.
- [x] Lifecycle endpoint requires the server-only cron secret.
- [x] Tournament IDs are validated server-side.
- [x] Cancellation preserves historical records.
- [x] Inactive games cannot be selected for new tournaments.
- [x] Existing tournaments remain intact if a game is later deactivated.
- [x] Scheduling does not directly modify wallet, ledger, PayU, deposit, withdrawal or winnings data.

## Verification

- [x] Prisma generation/validation/migrations passed in CI run #221.
- [x] Typecheck passed in CI run #221.
- [x] Lint passed in CI run #221.
- [x] Unit/integration tests passed in CI run #221.
- [x] Production build passed in CI run #221.
- [ ] Verify the Netlify scheduled function is discovered as Scheduled after the next production deployment.

## Scope exclusions

- Room credentials remain Phase 9.7.
- Tournament access codes remain Phase 9.8.
- Results/winners/prize settlement remain Phase 9.10.
- No new notification system is introduced.
- No new refund system is introduced.

Phase 9.5 must not begin automatically.
