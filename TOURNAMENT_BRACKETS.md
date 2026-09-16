# Tournament Brackets

## Architecture

Phase 9.6 adds a tournament-scoped bracket hierarchy:

`Tournament → TournamentBracket → TournamentBracketRound → TournamentBracketMatch → TournamentBracketSlot`

A bracket is unique per tournament. The current implementation supports `SINGLE_ELIMINATION`. The database format field is extensible for future formats such as round robin without pretending that unsupported formats are implemented today.

The bracket also snapshots the existing tournament participant format (`SOLO`, `DUO`, `SQUAD`, or `TEAM`) so later team-aware phases do not need to infer it from database IDs or mutable tournament state.

## Participants and teams

Bracket slots reference existing `Registration` records. Complete user records are never copied into matches. Current registration is user-based, while the schema keeps match slots generic enough for a future team-registration model.

## Generation

Only `CONFIRMED` registrations are snapshotted at generation time. Generation requires at least two confirmed participants and respects `maxParticipants`.

The participant order is randomized once, explicit seeds are stored, and subsequent generation requests return the existing bracket instead of reshuffling it.

## Single elimination

The generator creates a power-of-two bracket size and handles non-power-of-two counts with BYE slots. BYEs are structural slots only: they do not create registrations, payments, wallet transactions, or fake results.

Round names are derived from match counts, for example Round of 16, Quarterfinal, Semifinal, and Final. Match relationships store the next match and destination slot so later result handling can advance winners without rebuilding the bracket.

## Lifecycle

Bracket statuses: `DRAFT`, `GENERATED`, `ACTIVE`, `COMPLETED`, `CANCELLED`.

Match statuses: `PENDING`, `READY`, `LIVE`, `COMPLETED`, `CANCELLED`.

Phase 9.6 creates the structural winner-progression relationships but does not implement result submission or winner verification.

## Authorization

Bracket generation is admin-only. Public users receive a read-only bracket view containing rounds, match numbers, participant names, seeds, BYE/TBD states, and match status. Internal IDs and administrative controls are not exposed in the public UI.

## Concurrency and idempotency

Generation uses a PostgreSQL transaction, a tournament-scoped advisory lock, a row lock on the tournament, and a unique bracket-per-tournament constraint. This prevents simultaneous admin requests from creating duplicate brackets.

The complete bracket hierarchy is generated atomically. If generation fails, the transaction rolls back instead of leaving partial rounds or matches.

## Database constraints

The migration enforces:

- one bracket per tournament;
- unique round numbers per bracket;
- unique match numbers per round;
- unique slot numbers per match;
- a registration can appear at most once in a bracket;
- valid tournament, registration, round, match, and source-match references;
- supported bracket and status values;
- valid tournament participant-format values;
- valid slot and winner/next-slot values.

## Financial and registration isolation

Bracket generation performs zero wallet, ledger, PayU, payment, deposit, withdrawal, prize, or winnings transactions. Existing registrations remain authoritative and unchanged.

## Scheduling and excluded features

Tournament-level scheduling remains governed by Phase 9.4. Match scheduling is represented only by an optional `scheduledTime` field for later use.

Phase 9.6 does not implement room credentials, tournament access codes, timed access windows, result submission, winner verification, prize distribution, or payment/wallet changes.
