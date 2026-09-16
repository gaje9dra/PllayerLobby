# Phase 9.1 — Game Management Checklist

- [x] Existing Game model reused; no duplicate game system created.
- [x] Game ID remains authoritative and is never editable through the API.
- [x] Unique slug and unique existing game code preserved.
- [x] ACTIVE/INACTIVE behavior implemented using the existing `isActive` convention.
- [x] Valorant exists in the idempotent seed.
- [x] Stumble Guys exists in the idempotent seed.
- [x] Admin game list with status and tournament counts.
- [x] Admin search by name/slug.
- [x] Admin add game.
- [x] Admin edit game.
- [x] Admin activate/deactivate game.
- [x] Safe permanent deletion only when there are zero tournaments.
- [x] Used games are protected from destructive deletion.
- [x] Public active-games API.
- [x] Admin game API.
- [x] Server-side admin authorization.
- [x] Server-side name/slug/URL validation.
- [x] Unsafe markup/control-character input rejected.
- [x] Audit logging for create/update/activate/deactivate/delete.
- [x] Game mutation and audit event are transactionally coupled.
- [x] Existing tournament create/update workflow rejects inactive games.
- [x] Existing tournament history remains referenced by Game ID.
- [x] No wallet/ledger/PayU/deposit/withdrawal/prize-settlement code is called by game management.
- [x] No database migration required because the existing Game model already supplies the required Phase 9.1 fields and relationship.
- [x] Unit tests added for game input/slug/security validation.
- [ ] Full CI typecheck/lint/test/build verification after the Phase 9.1 commits.

## Phase boundary

Phase 9.1 does not implement tournament creation, scheduling, brackets, room credentials, tournament codes, or game-specific tournament configuration. Do not start Phase 9.2 automatically.
