# PlayerLobby — Phase 10.1 Checklist

## Aviator-style crash game foundation

- [x] Isolated `lib/games/aviator` module
- [x] Server-authoritative `WAITING → RUNNING → CRASHED → SETTLED → WAITING` lifecycle
- [x] Server-side multiplier engine
- [x] Server-side crash-point generator abstraction
- [x] Secret crash point excluded from public snapshots
- [x] Dedicated WebSocket realtime layer
- [x] Reconnect and round synchronization
- [x] Stale/invalid WebSocket message validation
- [x] Per-connection WebSocket rate limiting
- [x] Finalized round persistence
- [x] No per-tick database writes
- [x] `/games/aviator` responsive UI
- [x] Recent finalized round history
- [x] Connection status UI
- [x] Safe current-round API
- [x] Safe history API
- [x] Existing wallet left unchanged
- [x] No betting, cashout, deposits, withdrawals, payouts, or admin game controls
- [x] Unit tests for lifecycle, state validation, crash secrecy, and persistence
- [x] Developer architecture documentation

## Verification

Run locally from the repository root:

```text
npm ci
npm run prisma:generate
npm run db:validate
npm run db:migrate:deploy
npm run db:check
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run dev
```

Then verify `http://localhost:3000/games/aviator` and confirm that the multiplier, crash event, reconnect behavior, and recent-round history update from the server.

Phase 10.2 is intentionally not included in this checklist.
