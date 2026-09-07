# Registration Concurrency Notes

Phase 2.7 performs registration creation inside a PostgreSQL transaction. The tournament row is locked with `SELECT ... FOR UPDATE` before the current confirmed-registration count is evaluated and the registration row is written.

For free tournaments, this serializes capacity-sensitive registration attempts for the same tournament. The server re-checks the centralized Phase 2.6 eligibility rules while the tournament row is locked, then creates or reactivates the registration as `CONFIRMED`.

The database `userId + tournamentId` unique constraint remains the final duplicate-registration protection. If a duplicate constraint error occurs, the server returns a safe `ALREADY_REGISTERED` result rather than exposing Prisma or PostgreSQL details.

If a previous registration is `CANCELLED`, Phase 2.7 reuses that row and updates its status instead of inserting a second row. Registration history therefore remains in the same database record and the unique constraint is preserved.

Capacity is authoritative from `CONFIRMED` registrations. Paid registrations are created as `PENDING` and do not permanently consume participant capacity in this phase. This is intentional because no payment reservation or timeout system is implemented yet.

The payment phase must add an atomic payment-confirmation/capacity strategy before changing a paid `PENDING` registration to `CONFIRMED`. Without that later reservation/confirmation control, multiple pending paid registrations could exist for the same remaining slot, even though they do not currently consume permanent capacity.

All registration creation paths derive the user from the trusted server-side session. The browser supplies only the tournament identifier needed to select the target tournament; entry fee, tournament status, registration status, user ID, and payment state are authoritative server/database values.
