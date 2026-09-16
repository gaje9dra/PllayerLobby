# Tournament Lifecycle — Phase 9.4

## Authoritative lifecycle

The tournament lifecycle is centralized in `lib/tournament-lifecycle-rules.ts` and `lib/tournament-lifecycle.ts`:

`DRAFT → UPCOMING → REGISTRATION_OPEN → REGISTRATION_CLOSED → LIVE → COMPLETED`

`CANCELLED` is an administrative terminal state. A cancelled tournament is never automatically reopened.

## Date-based transitions

- `UPCOMING → REGISTRATION_OPEN` when server time `>= registrationStartTime`.
- `REGISTRATION_OPEN → REGISTRATION_CLOSED` when server time `>= registrationEndTime`.
- `REGISTRATION_CLOSED → LIVE` when server time `>= startTime`.
- `LIVE → COMPLETED` is explicit because the current `Tournament` schema has no authoritative `endTime`.

DRAFT is deliberately excluded from automatic transitions. An administrator must explicitly publish it with `DRAFT → UPCOMING`.

## Server authority and recovery

Lifecycle decisions use server-side `Date` values and database state. Browser clocks and countdown timers are never authoritative.

The lifecycle updater is safe to run repeatedly. Each transition uses a conditional `updateMany` keyed by the observed status, so concurrent workers/admin requests cannot overwrite a newer state. If a scheduled execution is missed, the next execution selects overdue tournaments and catches them up through the required forward states.

There are no in-memory timers. Application restarts therefore do not lose scheduled transitions.

## Automatic scheduler

The production deployment uses the existing Netlify infrastructure. `netlify/functions/tournament-lifecycle.mjs` runs every minute and calls the protected lifecycle endpoint:

`GET /api/admin/tournaments/lifecycle`

The endpoint requires `Authorization: Bearer <CRON_SECRET>`. The scheduler uses Netlify's `URL` environment variable and the server-only `CRON_SECRET`; it does not expose either secret to the browser.

Netlify Scheduled Functions execute according to their cron schedule and continue independently of whether a user has the site open. The application also performs server-side lifecycle refreshes on relevant requests as a defense-in-depth mechanism.

## Registration safety

Lifecycle refresh occurs before registration creation. The existing registration transaction locks the tournament row and then evaluates the registration window using the current server time. The effective rule is:

`now >= registrationStartTime AND now < registrationEndTime`

Therefore a stale status cannot extend registration beyond the configured closing time. The same transaction enforces the participant limit, preventing concurrent joins from exceeding capacity.

A tournament can be `REGISTRATION_OPEN` while its derived availability is `FULL`; capacity does not require a new permanent lifecycle status.

## Scheduling rules

New tournaments must have a future `startTime` and a valid ordering:

`registrationStartTime < registrationEndTime < startTime`

Existing tournaments can be edited while safe. Once participant activity exists, schedule changes are rejected. Schedule changes are also locked once a tournament has reached an active/finalized lifecycle state. All accepted schedule changes are audited through the existing admin audit mechanism.

## Cancellation

Cancellation is an explicit authorized admin action. It changes only the tournament status and preserves registrations, payments, wallet transactions, ledger entries, audit history, rooms and other historical records. No new refund system is introduced in Phase 9.4.

## Game deactivation

Deactivating a game does not delete or mutate its existing tournaments. The game must be active when creating a new tournament, while already-created scheduled tournaments remain intact.

## API security

`GET /api/admin/tournaments/lifecycle` is protected by `CRON_SECRET` and is intended only for the deployment scheduler. Administrative publish/cancel/status/schedule operations continue to require `requireAdmin()` and server-side lifecycle validation. Direct manipulation of a `tournamentId` cannot bypass those checks.

## Audit logging

Administrative lifecycle actions and accepted schedule changes use the existing `AdminAuditLog` transaction path. Metadata records the tournament, old/new status and whether the schedule changed. Automatic lifecycle transitions are system operations and are emitted by the scheduler/application lifecycle path without attributing them to a human administrator.

## Financial isolation

Lifecycle processing never directly changes wallet balances, ledger entries, PayU state, deposits, withdrawals, winnings or payment records. Registration entry payments remain in the existing registration/wallet transaction architecture. Cancellation does not create a new financial workflow.

## Completion limitation

Because the current `Tournament` model has no authoritative `endTime`, Phase 9.4 does not auto-complete LIVE tournaments. Later result processing can explicitly transition a LIVE tournament to COMPLETED.

## Scope boundary

Phase 9.4 does not implement room credentials, tournament access codes, match results, winner calculation, prize settlement, refunds, notifications, chat or other later-phase functionality.
