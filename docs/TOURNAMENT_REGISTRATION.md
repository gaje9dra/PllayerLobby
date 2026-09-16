# Tournament Registration

## Scope

Phase 9.5 provides secure tournament registration and participant management while reusing the existing Google authentication, wallet, immutable ledger, PayU, tournament lifecycle, and admin systems.

Room credentials and tournament access-code presentation are intentionally outside the user-facing Phase 9.5 flow.

## Registration flow

1. The user authenticates with the existing Google-only authentication flow.
2. The tournament page determines whether registration is currently allowed.
3. The server re-checks authentication, account status, tournament existence/status, registration window, capacity, duplicate registration, and eligibility.
4. The entry fee is read from the authoritative tournament row; client-supplied amounts are never accepted.
5. Paid registrations lock the wallet and tournament in a consistent order inside a PostgreSQL transaction.
6. The existing wallet transaction service creates the entry-fee debit and immutable ledger record.
7. The registration is confirmed only after the financial operation succeeds.
8. A stable `PL-REG-...` support reference is returned to the user. The database UUID is not used as the user-facing reference.

## Eligibility and lifecycle

Registration is accepted only while the server considers the tournament registration window open. Lifecycle refresh is performed before the registration transaction so stale scheduled states do not incorrectly permit entry. The authoritative window is `now >= registrationStartTime` and `now < registrationEndTime`.

DRAFT, UPCOMING, REGISTRATION_CLOSED, LIVE, COMPLETED, and CANCELLED tournaments do not accept normal new registration. Existing confirmed registrations remain historical records when a tournament closes, starts, is cancelled, or its game is deactivated.

## Capacity and concurrency

The tournament row is locked with PostgreSQL `FOR UPDATE` before the confirmed-participant count is evaluated. This prevents two concurrent requests from both consuming the final slot. The database unique constraint on `(userId, tournamentId)` independently prevents duplicate registrations.

Transactions retry on PostgreSQL serialization/write conflicts. The wallet row is locked before the tournament row for paid entries to keep lock ordering consistent across concurrent wallet spending.

## Wallet integration

The registration system never directly assigns `wallet.balance` and never creates ledger rows manually. It calls the existing wallet transaction service with:

- type: `DEBIT`
- category: `ENTRY_FEE`
- reference type: `ENTRY_PAYMENT`
- reference ID: registration ID
- currency: INR

The existing wallet transaction uniqueness constraint prevents the same registration debit from being recorded twice. An insufficient balance fails before a confirmed registration is created and does not create a partial debit.

## Idempotency and duplicate submission

The UI disables the Join button while the server action is pending. Backend protection is authoritative: the unique `(userId, tournamentId)` constraint, transaction locking, and retry handling prevent repeated requests from creating duplicate confirmed registrations or duplicate entry-fee ledger entries.

## Historical financial data

The wallet ledger entry is the authoritative historical record of the amount actually charged. Tournament configuration may change later without rewriting the existing wallet transaction. Payment records remain read-only and continue to use the existing PayU/payment workflow.

## User experience

A successful registration confirmation displays:

- tournament name
- game
- entry fee
- registration reference
- tournament date/time
- participant status
- remaining wallet balance for paid entries

The user can see registered tournaments from the existing dashboard's **My Tournaments** section. Registered tournament pages recognize an existing registration instead of offering a second normal join operation.

## Admin participant management

Admins can open a tournament's registration-management page to inspect participants, registration status, registration time, payment status/reference, capacity, and registration-code/room configuration status where those existing systems already expose safe operational metadata.

Admin pages require the existing admin authorization. Registration detail pages verify that the registration belongs to the tournament in the URL, preventing cross-tournament IDOR access.

Search supports existing safe user identity fields and transaction identifiers. Internal database identifiers are not intended as the primary user-facing support reference.

## Cancellation

Admin cancellation is non-destructive: the registration remains in the database, historical payment information is preserved, and no refund is performed by the registration feature. Any future refund must use the existing financial architecture rather than directly crediting the wallet.

## Security

- Google authentication remains the only login mechanism.
- Server-side authorization and eligibility checks are authoritative.
- Tournament IDs are validated before database access.
- Registration ownership is verified for user-facing private data.
- Admin participant data requires admin authorization.
- User-controlled tournament/participant text is rendered as text rather than executable HTML.
- Registration attempts are rate-limited using the existing security-rate-limit infrastructure.
- Client-supplied entry-fee values are ignored.
- No direct wallet-balance mutation is performed.

## Financial regression expectations

A successful paid registration must produce exactly one wallet debit and one corresponding immutable ledger transaction. A failed registration must produce no unintended debit or confirmed registration. Repeated requests must not produce additional charges. Exact-balance registration is allowed and must leave the wallet at zero; insufficient balance must be rejected without a negative balance.

## Out of scope

This phase does not introduce or redesign:

- room ID/password management
- tournament access-code presentation/entry windows
- brackets
- match generation or results
- winner settlement
- a new withdrawal or refund system

Those concerns remain in their designated later phases or existing systems.
