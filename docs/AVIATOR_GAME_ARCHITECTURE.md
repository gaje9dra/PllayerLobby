# PlayerLobby — Aviator Game Architecture

Phase 10.1 introduces the foundation for an original Aviator-style crash game at `/games/aviator`.

## Components

- **Game Engine** — owns one authoritative in-memory round lifecycle.
- **Round Lifecycle** — `WAITING → RUNNING → CRASHED → SETTLED → WAITING`.
- **Multiplier Engine** — derives the live multiplier from server time and round state; ticks are not persisted.
- **Crash Point Generator** — server-side abstraction for generating a crash point. The secret crash point is never exposed before the crash.
- **Realtime Layer** — broadcasts round state and multiplier updates to connected clients and provides current state after reconnect.
- **API** — exposes the current safe round state and recent finalized history.
- **Database** — persists finalized round metadata only; high-frequency multiplier ticks remain in memory.
- **UI** — renders the authoritative round state, smoothly displays the multiplier, shows recent history, and reports connection status.

## Round flow

1. The server creates a unique round ID and a server-side crash point.
2. The round remains `WAITING` for the configured countdown.
3. The server changes the round to `RUNNING` and begins deriving the multiplier from the server clock.
4. Realtime clients receive authoritative state snapshots and multiplier updates.
5. When the authoritative multiplier reaches the generated crash point, the server transitions to `CRASHED` and broadcasts the final multiplier.
6. The round is persisted as finalized and transitions to `SETTLED`.
7. A new waiting round is created.

## Synchronization and reconnection

Clients never create or mutate rounds. A reconnecting client receives the current round ID, phase, server timestamp, authoritative multiplier, and start timestamp. Messages for unknown or stale rounds are rejected.

## Persistence

Only the finalized round is stored. Multiplier ticks are intentionally not stored individually, avoiding high-frequency database writes.

## Future betting integration

Phase 10.1 does not place bets, cash out, deduct or credit wallets, process deposits/withdrawals, or expose admin controls. Later betting functionality can consume the server-authoritative round engine through a dedicated service boundary and the existing PlayerLobby wallet system.
