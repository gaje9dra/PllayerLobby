# PayU — Phase 3.1

Phase 3.1 adds the secure foundation for PayU hosted checkout for paid tournament registrations. Payment verification/reconciliation is intentionally deferred to the next payment phase.

## Merchant setup

Create/configure a PayU merchant account and obtain the merchant key and salt from PayU. Use the hosted web checkout flow; this application does not collect card numbers, CVV, PIN, OTP, or banking passwords.

## Environment variables

Set these server-side values in `.env.local` or the deployment environment:

```env
PAYU_MERCHANT_KEY=your-test-or-production-key
PAYU_MERCHANT_SALT=your-secret-salt
PAYU_ENVIRONMENT=test
```

`PAYU_ENVIRONMENT` must be `test` or `production`.

`PAYU_MERCHANT_SALT` is secret. Never expose it through `NEXT_PUBLIC_*`, client components, browser JavaScript, URLs, query parameters, HTML, logs, or public API responses. Never commit real credentials.

The application uses:

- Test checkout: `https://test.payu.in/_payment`
- Production checkout: `https://secure.payu.in/_payment`

## Customer phone

PayU Hosted Checkout currently requires a phone number. The existing Google user model did not contain a phone field, so Phase 3.1 adds an optional server-side `User.phone` field. If it is empty, the payment UI asks the authenticated user for a 10-digit Indian mobile number and stores it on that user's account before creating the payment. Existing stored phone numbers are used instead of trusting a browser override.

## Callback

Configure PayU success/failure responses to POST to:

```text
https://YOUR_DOMAIN/api/payu/callback
```

The callback is treated as untrusted input. It checks the payment record, merchant transaction ID, database amount, product information, trusted user email/name/phone, merchant key, and PayU response hash.

A valid success redirect does **not** mark the payment `SUCCESS` and does **not** confirm the registration. A verified PayU success response remains `PENDING` until the next payment verification/reconciliation phase establishes the final result.

A verified non-success callback may move the payment to `FAILED`. No client request can directly set payment status.

## Payment flow

1. User registers for a paid tournament.
2. Registration is created as `PENDING`.
3. User selects **Proceed to Payment**.
4. The server authenticates the user and verifies registration ownership.
5. The server loads the tournament entry fee from PostgreSQL.
6. The server rejects free tournaments, non-pending registrations, unavailable tournaments, already-paid registrations, and duplicate pending payment attempts.
7. The server ensures a valid PayU-required phone exists for the authenticated user.
8. The server generates a unique merchant transaction ID.
9. The server creates a `Payment` record with `PENDING` status.
10. The server generates the PayU SHA-512 request hash using the documented hosted web formula.
11. The browser receives only the PayU checkout URL and required checkout fields, then submits them to PayU hosted checkout.
12. PayU posts the response to the callback endpoint.
13. The callback validates the response hash and database relationships but does not finalize successful payment.

## Database

`Payment` belongs to `Registration` and contains only payment identifiers, amount, currency, status, and timestamps. It does not store card data or PayU salt.

`merchantTransactionId` is unique. `registrationId`, `status`, and the registration/status combination are indexed.

The Phase 3.1 service blocks a new payment while a `PENDING` or `INITIATED` payment exists. Failed/cancelled attempts can be retried by the server in a later initiation request; no timeout mechanism is implemented in this phase.

## Hashing

For the standard hosted web payment request, the application uses the PayU documented SHA-512 sequence:

```text
key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
```

The callback foundation validates the documented regular reverse hash sequence before accepting the callback state update.

Reference: PayU's current hashing documentation: https://docs.payu.in/docs/hashing-request-and-response

## Testing

Use test credentials only. Never place production credentials in automated tests.

Recommended checks:

```bash
npx prisma generate
npm run db:validate
npm run db:migrate:deploy
npm test
npx tsc --noEmit
npm run lint
npm run build
```

The test suite covers request hashing, response-hash validation, tampered amounts, transaction ID generation, payment state transitions, and missing PayU configuration. Database integration tests should use a test PostgreSQL database and test PayU credentials/mocks only.

## Phase boundary

Phase 3.1 does not implement final payment verification/reconciliation, registration confirmation from payment success, payouts, refunds, rooms, registration codes, match results, leaderboards, or a payment reconciliation dashboard.
