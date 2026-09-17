# Phase 10.1 implementation notes

This phase adds the crash-game foundation only. Betting, cashout, wallet mutations, deposits, withdrawals, payouts, admin game controls, and betting history are intentionally outside this phase.

The public game state is limited to round ID, lifecycle phase, server time, multiplier, and round start information. The crash threshold remains server-side until the round reaches its crash event.
