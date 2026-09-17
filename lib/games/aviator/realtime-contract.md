# Realtime contract

The game engine is server authoritative. The current implementation exposes an event stream for connected clients. Event payloads contain only the public round snapshot: round ID, phase, server time, multiplier, and start time. The generated crash point remains server-only until the round has crashed.
