# PlayerLobby — Aviator Game Architecture

Phase 10.1 introduces the foundation for an original Aviator-style crash game at `/games/aviator`.

## Components

- **Game Engine** — owns one authoritative in-memory round lifecycle.
- **Round Lifecycle** — `WAITING → RUNNING → CRASHED → SETTLED → WAITING`.
- **Multiplier Engine** — derives the live multiplier from server time and round state; ticks are not persisted.
- **Crash Point Generator** — server-side abstraction for generating a crash point. The secret crash point is never exposed before the crash.
- **WebSocket Layer** — a dedicated server-side WebSocket endpoint at `/api/games/aviator/ws` broadcasts synchronized round events and accepts only the read-only `round:sync` command.
- **API** — exposes the current safe round state and recent finalized history.
- **Database** — persists finalized round metadata only; high-frequency multiplier ticks remain in memory.
- **UI** — renders the authoritative round state, smoothly transitions between multiplier updates, shows recent history, and reports connection status.

## Round flow

1. The server creates a unique round ID and a server-side crash point.
2. The round remains `WAITING` for the configured countdown.
3. The server changes the round to `RUNNING` and begins deriving the multiplier from the server clock.
4. WebSocket clients receive authoritative state snapshots and multiplier updates.
5. When the authoritative multiplier reaches the generated crash point, the server transitions to `CRASHED` and broadcasts the final multiplier.
6. The round is persisted as finalized and transitions to `SETTLED`.
7. A new waiting round is created.

## WebSocket synchronization

The custom Node server owns the WebSocket upgrade at `/api/games/aviator/ws`. The browser sends only:

```json
{"type":"round:sync","roundId":"OPTIONAL_CURRENT_ROUND_ID"}
```

The server validates the message, rejects stale round IDs, applies a per-connection rate limit, and returns the current authoritative snapshot. Unknown commands, malformed payloads, oversized frames, unmasked client frames, and invalid state-related input are rejected without exposing server internals.

Server events are:

```text
round:waiting
round:started
multiplier:update
round:crashed
round:settled
round:sync
```

The server rejects cross-origin WebSocket handshakes when an `Origin` header is supplied and does not expose the secret crash point.

## Reconnection

Clients fetch the current REST snapshot, connect to the WebSocket, request synchronization, and automatically reconnect after a disconnect. A reconnecting client therefore receives the current round ID, phase, server timestamp, multiplier, and round start information.

Clients never create or mutate rounds.

## Persistence

Only the finalized round is stored in `AviatorRound`. Multiplier ticks are intentionally not stored individually, avoiding high-frequency database writes.

## API

- `GET /api/games/aviator/round` — current safe round snapshot.
- `GET /api/games/aviator/history` — recent finalized round multipliers.

Neither API exposes the future crash point.

## Wallet boundary

Phase 10.1 does not place bets, cash out, deduct or credit wallets, process deposits/withdrawals, or expose admin game controls. Later betting functionality can consume the server-authoritative round engine through a dedicated service boundary and the existing PlayerLobby wallet system.
