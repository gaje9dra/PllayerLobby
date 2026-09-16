# Tournament Creation & Configuration — Phase 9.2

## Scope

Phase 9.2 provides the admin workflow for creating and configuring tournaments while preserving the existing Game, wallet, PayU, ledger, registration, results, room, prize, settlement, authentication, and admin systems.

## Tournament model

`Tournament` is the authoritative configuration record. It references `Game` through `gameId` and stores the tournament name, slug, description, rules, banner URL, schedule, monetary values, participant limit, format, region, lifecycle status, and joining-window configuration.

The database already contains indexes for `gameId`, `status`, `startTime`, `registrationStartTime`, and `registrationEndTime`. No new schema migration was required for Phase 9.2.

## Game relationship

Tournament creation loads games from the existing `Game` table. The server verifies the submitted game ID and requires the game to be active. Game names are not used as the tournament's permanent identity.

## Creation process

1. Authorized administrator opens `/admin/tournaments/create`.
2. Active games are loaded from PostgreSQL.
3. Administrator enters tournament configuration.
4. Server-side validation checks identity, text, URL, money, participant limit, format, region, joining window, and schedule.
5. Tournament is created as `DRAFT`.
6. The draft can be edited later.
7. Publishing validates the stored configuration again and transitions `DRAFT → UPCOMING`.

## Drafts

Draft tournaments are admin-only and are excluded from public tournament queries. Creating or editing a draft does not create a wallet transaction.

## Publishing

Publishing is a separate authenticated admin action. It checks:

- active game
- valid name and slug
- valid description/rules fields
- valid banner URL
- valid monetary values
- positive participant limit
- valid format and region
- valid joining window
- registration start < registration end < tournament start
- draft status

Publishing is transaction-safe and writes the corresponding admin audit event in the same database transaction.

## Editing

The server revalidates every submitted field and uses an optimistic status condition when updating. Financially relevant changes are restricted once a tournament becomes operational or has participant activity. Participant limits cannot be reduced below the current non-cancelled participant count. Finalized prize pools cannot be silently changed.

Historical payment and ledger records are never rewritten by tournament configuration changes.

## Cancellation

Cancellation is a status transition, not destructive deletion. Existing registrations, payments, financial history, results, and audit records remain associated with the tournament.

## Admin list

`/admin/tournaments` supports:

- name, slug, or UUID search
- game filter
- status filter
- start-date range filter
- sorting
- pagination
- participant count

## Public tournament information

Published tournaments are available through `/tournaments` and `/tournaments/[slug]`. Public pages expose tournament-facing information only: game, name, description, rules, entry fee, prize pool, participant count, participant limit, registration window, start time, format, region, and public lifecycle status.

The complete registration/payment flow is an existing/later participant workflow and is not redesigned by Phase 9.2.

## Financial isolation

Tournament creation, editing, and publishing do not directly debit or credit wallets. They do not create deposits, withdrawals, entry payments, prize settlements, or ledger transactions. Existing financial services remain authoritative.

## Security

All admin mutations call `requireAdmin()` server-side. IDs are validated before database operations. Game activation is checked server-side. User-supplied descriptions and rules are rendered as text rather than HTML. Banner URLs are restricted to HTTP(S). Audit events record create, update, publish, and cancel actions.

## API / server actions

The admin workflow uses Next.js server actions rather than exposing an additional duplicate tournament service. Existing public tournament pages read from PostgreSQL. This keeps authorization and validation at the server boundary and avoids a second source of truth.

## Testing

Focused unit tests cover slug normalization, valid configuration, invalid money, required schedule fields, and lifecycle transition rules. Project CI remains responsible for Prisma generation/validation/migrations, typecheck, lint, tests, and production build.

## Financial isolation acceptance

A tournament configuration change must produce zero wallet transactions. Any later registration, payment, refund, prize, or withdrawal movement must continue through the existing financial service layer.
