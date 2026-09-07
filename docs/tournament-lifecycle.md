# Tournament Lifecycle — Phase 3.6

## Authoritative lifecycle

The tournament lifecycle is centralized in `lib/tournament-lifecycle-rules.ts` and `lib/tournament-lifecycle.ts`:

`DRAFT → UPCOMING → REGISTRATION_OPEN → REGISTRATION_CLOSED → LIVE → COMPLETED`

`CANCELLED` is an administrative terminal state. A cancelled tournament is never automatically reopened.

## Date-based transitions

- `UPCOMING → REGISTRATION_OPEN` when `currentTime >= registrationStartTime`.
- `REGISTRATION_OPEN → REGISTRATION_CLOSED` when `currentTime >= registrationEndTime`.
- `REGISTRATION_CLOSED → LIVE` when `currentTime >= startTime`.
- `LIVE → COMPLETED` is **not automatic** because the current `Tournament` schema has no authoritative `endTime`.

DRAFT is deliberately excluded from automatic transitions. An administrator must explicitly publish it with `DRAFT → UPCOMING`.

## Admin status changes

Admin status changes are validated against the centralized transition rules. Forward lifecycle transitions are allowed only when their date condition is due. `DRAFT → UPCOMING` is the explicit publication action. Cancellation remains an explicit administrative action and requires the existing `requireAdmin()` authorization path.

The status update uses a conditional database update so a concurrent lifecycle worker or admin cannot silently overwrite a newer status.

## Refresh strategy

There was no existing cron, Vercel Cron, worker, or server scheduler in the repository. Phase 3.6 therefore provides two complementary mechanisms:

1. Server-side refresh when the public tournament listing, public tournament detail, registration workflow, or protected room-access workflow is used.
2. A protected server endpoint at `GET /api/admin/tournaments/lifecycle` for deployment schedulers.

The endpoint requires `Authorization: Bearer <CRON_SECRET>`. `CRON_SECRET` is server-only and is documented in `.env.example`.

The batch updater uses indexed status/date predicates and processes at most 100 candidates per pass, with bounded catch-up passes. Updates are conditional on the observed status, so duplicate/concurrent invocations safely become no-ops when another worker has already advanced a tournament.

A deployment may invoke the endpoint from its supported scheduler. No always-running Node process is required.

## Registration safety

Lifecycle refresh occurs before registration creation. The existing registration eligibility service remains authoritative and still compares the actual server time with `registrationStartTime` and `registrationEndTime`. Therefore a stale `Tournament.status` cannot extend the registration window.

## Room-access safety

Protected room access refreshes the tournament lifecycle before checking access. Room access still requires the existing server-side checks: active authenticated user, matching confirmed registration, valid registration code, joinable status, joining window based on `startTime` and `joiningWindowMinutes`, and a published/non-revoked room.

Cancelled tournaments remain blocked and their registration/payment/code/room history is preserved.

## Timezone

Tournament timestamps continue to use the existing application timezone parsing and database timestamp strategy. Lifecycle comparisons use JavaScript `Date` values representing absolute instants. No manual hour offsets are introduced.

## Completion limitation

The current Prisma `Tournament` model has `startTime` but no `endTime`. Phase 3.6 therefore intentionally leaves `LIVE` tournaments as `LIVE` until an administrator explicitly completes them. A future tournament-results/settlement phase can define the authoritative completion condition.

## Scope boundary

Phase 3.6 does not implement results, scoring, winners, payouts, refunds, leaderboards, game-lobby APIs, notifications, chat, or other later-phase functionality.
