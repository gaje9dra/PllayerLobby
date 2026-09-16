# Phase 9.3 — Game-Specific Tournament Configuration

- [x] Modular game-specific configuration architecture exists outside Tournament columns.
- [x] Valorant configuration schema and UI implemented.
- [x] Stumble Guys configuration schema and UI implemented.
- [x] Dynamic game selection loads only relevant settings.
- [x] Frontend/native constraints are present for game-specific fields.
- [x] Server-side authoritative validation implemented.
- [x] Configuration is linked to the correct tournament and game.
- [x] Database foreign keys and unique tournament constraint prevent orphan/duplicate configuration records.
- [x] Existing tournaments without configuration remain readable.
- [x] Inactive games do not delete historical configuration.
- [x] Admin authorization is required for configuration mutation and read API.
- [x] Tournament-ID/IDOR checks verify the requested tournament and game relationship.
- [x] Unknown fields, malformed JSON, invalid IDs, unsafe values, and unsupported enum values are rejected.
- [x] No entry-fee or prize-pool duplicate fields exist in game configuration.
- [x] Wallet, PayU, ledger, payment, deposit, withdrawal, winnings, and settlement mutation paths are untouched.
- [x] Game configuration writes produce no financial transactions.
- [x] Published/participant-active configuration changes are blocked server-side.
- [x] Configuration changes are audited with admin, tournament, game, action, timestamp, and version metadata.
- [x] Public tournament details expose only safe game-specific summary fields.
- [x] Admin tournament detail exposes validated configuration with a legacy fallback.
- [x] Protected admin game-config GET/PATCH API implemented.
- [x] No brackets, matches, room credentials, unique tournament codes, registration flow, or settlement logic added.
- [x] Validation tests added for both supported games and cross-game/security cases.
- [x] Documentation added in GAME_SPECIFIC_CONFIGURATION.md.

## Verification required before marking complete

- [ ] Prisma migration deploy succeeds.
- [ ] Prisma generation succeeds.
- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Unit/integration tests pass.
- [ ] Authorization/security tests pass.
- [ ] Financial regression tests pass.
- [ ] Production build passes.

**Phase boundary:** Do not start Phase 9.4 automatically.
