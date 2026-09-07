# Registration Codes — Phase 3.3

Phase 3.3 adds a per-registration code that is created only when a tournament registration becomes `CONFIRMED`.

## Lifecycle

- Free tournament: registration is confirmed server-side and a code is generated in the same database transaction.
- Paid tournament: registration remains `PENDING` until the existing server-side PayU verification succeeds. The confirmation transaction then creates the code together with `Payment = SUCCESS` and `Registration = CONFIRMED`.
- A cancelled registration can receive a fresh code when it is legitimately reactivated.
- A revoked code is not accepted by the validation service.
- Repeated successful payment callbacks do not generate another code when one already exists.

## Code format

Codes are 12 random characters displayed as:

```text
XXXX-XXXX-XXXX
```

The accepted input is normalized for case, whitespace, and hyphen differences before hashing.

## Storage security

The database stores:

- SHA-256 `codeHash` for validation and uniqueness.
- AES-256-GCM `codeEncrypted` so the authenticated owner can retrieve the code later.
- `revokedAt` for server-side revocation.

The encryption key is derived from the existing `AUTH_SECRET`; no new public secret or client-side key is introduced.

The plaintext code is never written to logs, URLs, public tournament data, or metadata.

## Validation service

`lib/registration-code.ts` is the single server-side validation service intended for later participant joining. `validateRegistrationCode()` verifies:

1. Registration ID and tournament ID shape.
2. Authenticated user exists and is `ACTIVE`.
3. Code format/hash is valid.
4. Code is not revoked.
5. Code belongs to the supplied registration.
6. Registration belongs to the authenticated user.
7. Registration belongs to the supplied tournament.
8. Registration is `CONFIRMED`.

The service therefore provides the RegistrationCode → Registration → User/Tournament ownership chain required by the next room-access phase.

## Revocation

`revokeRegistrationCode()` is server-only and requires the existing `requireAdmin()` authorization helper. It does not expose the code value.

## Phase boundary

This phase does not implement tournament rooms, room passwords, joining windows, match results, leaderboards, payouts, refunds, or game API integration.
