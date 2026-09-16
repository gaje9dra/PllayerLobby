# Game Management — Phase 9.1

## Model

PlayerLobby already has a `Game` model with a UUID-style authoritative `id`, unique `slug`, unique `code`, optional `description`, optional `logoUrl`, `isActive`, and timestamps. `Tournament.gameId` is the foreign-key identity used for the Game → Tournament relationship.

No new game-specific tournament configuration is introduced in this phase.

## Status

- `ACTIVE`: returned by the public games API and eligible for new tournaments.
- `INACTIVE`: hidden from the public active-games API and rejected by the existing tournament create/update workflow for new tournament use.

Deactivation is non-destructive. Existing tournaments and their registrations, results, rooms, settlements, payments, and financial records remain intact.

## Admin operations

`/admin/games` is protected by the existing server-side `requireAdmin()` authorization.

Administrators can:

- list games
- search by name or slug
- filter by status
- add games
- edit name, slug, description, logo URL, and status
- activate/deactivate games
- permanently delete a game only when it has no tournament dependents

A used game cannot be destructively deleted; the UI and API require deactivation instead.

## APIs

- `GET /api/games` — active games only; public read operation.
- `GET /api/admin/games` — authenticated admin list/search/filter.
- `POST /api/admin/games` — authenticated admin create.
- `PATCH /api/admin/games/:gameId` — authenticated admin update/status change.
- `DELETE /api/admin/games/:gameId` — authenticated admin delete only when no tournaments exist.

The public API does not expose inactive games.

## Identity and validation

The database `id` remains authoritative and is never accepted as a mutable field. Slugs are normalized to lowercase kebab-case and must be unique. Names are required, length-limited, and checked case-insensitively for duplicates. Control characters and angle-bracket markup are rejected by the server-side input validation. Logo URLs are limited to HTTP(S) URLs.

## Seed

`prisma/seed.ts` already seeds Valorant and Stumble Guys using `upsert` by slug, so repeated seed runs do not create duplicate records. The existing seed remains the source for the two initial games.

## Audit logging

Game create, update, activate, deactivate, and safe delete operations use the existing admin audit system. Mutation and audit record creation occur in the same Prisma transaction.

## Tournament relationship

The existing tournament workflow selects only active games and validates the selected game's active state server-side before creation/update. The database relation uses `Tournament.gameId` and `Game.id`; deletion is restricted by the relation and by the explicit admin delete guard.

## Financial isolation

Game management does not call wallet, PayU, deposit, withdrawal, ledger, entry-payment, or prize-settlement services. Game mutations create zero financial transactions and do not alter wallet balances or financial records.

## Security

- Server-side admin authorization on every mutation.
- UUID validation for game mutation identifiers.
- No client-provided role or balance is trusted.
- Duplicate names/slugs are rejected.
- Unsafe text markup/control characters are rejected.
- Logo URLs are restricted to HTTP(S).
- Used games cannot be deleted.
- Existing tournament references are preserved.

## Testing

The repository CI must run Prisma validation/migrations, lint, typecheck, tests, and production build. Game-management tests cover validation/slug behavior, duplicate handling, active/inactive public filtering, destructive-delete rules, authorization boundaries, tournament preservation, seed idempotency, and financial regression behavior where the existing test harness permits database integration.
