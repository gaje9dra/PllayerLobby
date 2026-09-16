# Game-Specific Tournament Configuration — Phase 9.3

## Architecture

Core tournament data remains in `Tournament`. Game-specific settings are stored in the normalized `TournamentGameConfig` table as validated JSONB, keyed by both `tournamentId` and `gameId`. The table has a unique tournament constraint and foreign keys to the existing `Tournament` and `Game` records.

The configuration layer is implemented in `lib/game-specific-config.ts`. It exposes a registry of supported game codes and independent validators. Adding another game means adding its schema/validator and a form module; the core Tournament model does not gain game-specific columns.

## Supported games

### Valorant

- Format: 5v5, 3v3, or 1v1
- Team size: 5, 3, or 1, consistent with format
- Game mode: Competitive, Unrated, Swiftplay, or Custom
- Map: supported Valorant map enum plus Any
- Rounds: 1–99
- Scoring: bounded integer point map

### Stumble Guys

- Format: Solo, Duo, or Squad
- Participant structure: Individual or Team
- Rounds: 1–10
- Game mode: Race, Elimination, or Custom
- Scoring: bounded integer point map

The configuration intentionally contains no entry fee or prize-pool field. Those values remain authoritative on `Tournament`.

## Validation

The same pure validation function is used by the client form and server-side mutation/API paths. Unknown fields, unsupported enum values, malformed JSON, unsafe values, incompatible Valorant format/team-size combinations, and invalid round ranges are rejected. Server validation is authoritative.

## Admin UI

The tournament form receives the selected Game code and renders a modular game configuration component. Changing the game replaces the visible game-specific fields. Irrelevant Valorant fields are not shown for Stumble Guys and vice versa.

## API

`GET /api/admin/tournaments/:id/game-config` returns the configuration only to an authorized administrator.

`PATCH /api/admin/tournaments/:id/game-config` accepts `{ "gameConfig": ... }`, validates the object against the tournament's actual Game, verifies the tournament ID and participant state, and writes the configuration transactionally with its audit event.

The normal tournament create/update server actions also persist configuration in the same transaction as the tournament mutation.

## Authorization and IDOR protection

All admin UI/actions/API paths call the existing `requireAdmin()` path. Configuration queries use the requested tournament ID and verify that the stored `gameId` and `gameCode` match the tournament's authoritative Game. Configuration cannot be modified after publication or participant activity.

## Versioning and lifecycle safety

Each configuration has `version`, currently `1`. Draft configurations may be edited. Once a tournament is published or has participant activity, a changed configuration is rejected server-side. Historical configurations remain readable even if their Game becomes inactive.

## Backward compatibility

Existing tournaments created before Phase 9.3 may have no `TournamentGameConfig` row. They remain readable; the UI shows a fallback message and does not crash. Publishing a supported-game draft requires a valid game-specific configuration so newly public tournaments cannot bypass the schema.

## Migration

Migration `20260916113000_game_specific_tournament_configuration` creates the JSONB configuration table, a unique tournament constraint, foreign keys, and indexes. It does not alter or delete wallets, ledger rows, payments, registrations, games, tournaments, results, or prize data.

## Financial isolation

Game-specific configuration code does not import or call wallet, ledger, PayU, deposit, withdrawal, payment, winnings, or settlement mutation code. Creating/updating/publishing configuration performs no financial transaction. Tournament entry fee and prize pool remain single-source-of-truth fields on `Tournament`.

## Testing

`tests/game-specific-config.test.ts` covers Valorant and Stumble Guys acceptance, invalid game-specific values, cross-game field rejection, malformed input, unknown games, and unsafe payloads. Existing tournament lifecycle tests remain in place.
