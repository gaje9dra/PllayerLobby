# Phase 5.4 — Payout Destinations

Payout destinations prepare the platform for future withdrawal processing without moving money.

## Supported destinations

- UPI
- BANK_ACCOUNT

New destinations are `PENDING_VERIFICATION`. No verification provider is connected in this phase, so the application never fakes a `VERIFIED` state. Withdrawal requests may preserve a pending destination snapshot, but admin approval requires the destination to be genuinely `VERIFIED`.

## Stored data

Sensitive UPI and bank fields are stored only inside `encryptedDestinationData`. AES-256-GCM is used with a server-only `PAYOUT_ENCRYPTION_KEY`, which must be a base64-encoded 32-byte key. The key is never stored in PostgreSQL or sent to the browser.

The database also stores only a masked display value for normal UI/admin views. Complete account numbers, UPI IDs, IFSC and account-holder data are never rendered as normal UI data.

A future HMAC lookup secret is intentionally not added because duplicate detection is not required yet.

## Withdrawal snapshots

A withdrawal records its `payoutDestinationId` plus an immutable snapshot containing destination type, masked display value, and encrypted destination data. The snapshot is created inside the same serializable transaction as the withdrawal request and is not rewritten when a destination is later disabled or replaced.

Existing Phase 5.3 withdrawals may have null snapshot fields because they predate Phase 5.4. Reconciliation reports those records rather than mutating financial history.

## Security

- User identity and ownership come from the authenticated server session.
- Destination IDs are checked against the authenticated user.
- Disabled destinations cannot be used for new requests.
- Approval requires a verified destination and revalidates ownership and snapshot integrity.
- No admin action edits a user's destination fields.
- No sensitive destination value is logged, put in URLs, or exposed publicly.
- PIN, OTP, CVV, card data, banking passwords, Aadhaar, PAN and biometric data are not collected.

## Key generation

Generate a random 32-byte key and base64-encode it, then place it in the server environment as `PAYOUT_ENCRYPTION_KEY`. Never commit the real value. Key rotation requires a future migration/decryption strategy and is not implemented in this phase.

## Explicit exclusions

This phase does not implement UPI payouts, bank transfers, payout-provider APIs/webhooks, automatic payout processing, KYC providers, Aadhaar/PAN verification, OTP/UPI PIN, card/CVV storage, tax/TDS calculation, or refunds.
