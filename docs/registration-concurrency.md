# Registration Concurrency Notes

Phase 2.6 performs eligibility checks and capacity reads only. It intentionally does not create registrations.

When registration creation is implemented, the eligibility check must not be treated as a reservation. Two concurrent requests can both observe the same remaining capacity between their reads.

The creation flow must therefore perform the capacity-sensitive write atomically, for example by using an appropriate database transaction/locking strategy or an equivalent atomic capacity invariant. The existing unique `userId + tournamentId` constraint protects against duplicate registrations for the same user, but it does not by itself protect tournament-wide capacity.

Capacity is authoritative from `CONFIRMED` registrations. `PENDING` registrations must not permanently consume capacity in Phase 2.6.

Because `userId + tournamentId` is unique, re-registration after a `CANCELLED` record should reuse or update that existing row rather than blindly inserting a second row. This preserves the unique constraint and the registration history.

All registration creation paths must derive the user from the trusted server-side session and call the centralized eligibility service before attempting the write.
