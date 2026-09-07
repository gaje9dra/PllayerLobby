# PayU — Phase 3.1 and 3.2

Phase 3.1 provides the PayU hosted checkout foundation. Phase 3.2 adds server-side transaction verification and makes verified PayU success the only path that changes a paid registration from `PENDING` to `CONFIRMED`.

## Merchant setup

Create/configure a PayU merchant account and obtain the merchant key and salt from PayU. Use the hosted web checkout flow; this application does not collect card numbers, CVV, PIN, OTP, or banking passwords.

## Environment variables

Set these server-side values in `.env.local` or the deployment environment:

```env
NEXT_PUBLIC_APP_URL=https://your-public-domain.example
PAYU_MERCHANT_KEY=your-test-or-production-key
PAYU_MERCHANT_SALT=your-secret-salt
PAYU_ENVIRONMENT=test
```

`PAYU_ENVIRONMENT` must be `test` or `production`.

`PAYU_MERCHANT_SALT` is secret. Never expose it through `NEXT_PUBLIC_*`, client components, browser JavaScript, URLs, query parameters, HTML, logs, or public API responses. Never commit real credentials.

## PayU endpoints

Hosted checkout:

- Test: `https://test.payu.in/_payment`
- Production: `https://secure.payu.in/_payment`

Verify Payment API:

- Test: `https://test.payu.in/merchant/postservice.php?form=2`
- Production: `https://info.payu.in/merchant/postservice.php?form=2`

PayU documents `verify_payment` as the server-side transaction verification API and requires the general command hash `sha512(key|command|var1|salt)`.

For an actual PayU test transaction, the callback URL must be reachable by PayU over the public internet. A local-only `http://localhost:3000` URL is suitable for normal application development but not for PayU's external callback.

## Customer phone

PayU Hosted Checkout requires a phone number. The existing Google user model therefore contains an optional server-side `User.phone` field. If it is empty, the payment UI asks the authenticated user for a 10-digit Indian mobile number and stores it on that user's account before creating the payment. Existing stored phone numbers are used instead of trusting a browser override.

## Callback

Configure PayU success/failure responses to POST to:

```text
https://YOUR_DOMAIN/api/payu/callback
```

The callback is treated as untrusted input. It validates the merchant transaction ID against the internal Payment record, compares PayU-returned customer/payment fields with database values, validates the PayU reverse hash, then calls the server-side Verify Payment API before changing payment or registration state.

The browser callback is never the final authority. A `success` status in the callback alone cannot confirm the registration.

## Server-side verification flow

1. User registers for a paid tournament.
2. Registration is created as `PENDING`.
3. Server creates a Payment with the authoritative database entry fee.
4. User is redirected to PayU hosted checkout.
5. PayU returns a signed response to the callback.
6. Server locates Payment by `txnid`/`merchantTransactionId`.
7. Server validates key, transaction ID, amount, product information, customer identity fields, and reverse hash.
8. Server generates the `verify_payment` request hash on the server.
9. Server calls PayU's Verify Payment API.
10. Server validates the returned transaction ID, amount, tournament entry fee, customer/payment fields, and PayU status.
11. Only a verified `success` + `captured`/`auth` result can move Payment to `SUCCESS`.
12. Payment `SUCCESS` and Registration `CONFIRMED` are written in the same Prisma transaction.
13. The browser is redirected to `/payment/result`, which reads the actual database state rather than trusting the callback query parameters.

PayU recommends reconciliation using the Verify Payment API after receiving the payment response. The verification response includes fields such as `txnid`, `mihpayid`, `amt`, `transaction_amount`, `status`, and `unmappedstatus`.

## Verification states

- `SUCCESS`: PayU reports `status=success` and an approved internal state such as `captured` or `auth`; amount and transaction data also match the database.
- `FAILED`: PayU reports a failed/cancelled internal state.
- `PENDING`: PayU has not conclusively completed the transaction or the verification service is temporarily unavailable.
- `UNKNOWN`: An unexpected or unusable PayU verification response. The application keeps an unresolved payment pending rather than assuming success.

PayU documents `captured` as a successful transaction, `auth` as an authorized success state, and `pending`/`initiated`/`in progress` as non-final states.

## Amount validation

The authoritative amount comes from PostgreSQL. The server compares:

```text
Tournament.entryFee
        ==
Payment.amount
        ==
PayU callback amount
        ==
PayU verified amt
```

When PayU returns `transaction_amount`, it is also checked against the same expected amount. Malformed, negative, zero-for-paid-tournament, or mismatched amounts cannot confirm payment.

## Hashing

Hosted payment request hash:

```text
key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
```

PayU response reverse hash:

```text
SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
```

Verify Payment API hash:

```text
key|verify_payment|txnid|salt
```

These formulas follow PayU's current documentation.

## Atomic confirmation

The success path locks the Payment row and performs these updates in one Prisma transaction:

```text
Payment = SUCCESS
Registration = CONFIRMED
```

The application does not intentionally leave a successful payment with a pending registration. If the database transaction fails, the operation is not reported as successful and can be retried/reconciled.

## Idempotency and retries

Repeated callbacks for an already successful payment are harmless. The application does not create another Payment or Registration. A failed payment remains in the payment history and a later retry creates a new merchant transaction ID through the existing Phase 3.1 initiation flow.

The original failed payment is not overwritten or reused.

## Pending and verification failures

If PayU verification is inconclusive or the verification service is unavailable, the Payment remains `PENDING` and the Registration remains `PENDING`. The user sees a safe verification-in-progress message.

The application never treats HTTP 200, a browser redirect, or callback `status=success` by itself as proof of payment. PayU recommends server-side verification/reconciliation after the callback.

## Payment result page

The browser is redirected to:

```text
/payment/result?txnid=<merchant-transaction-id>
```

The page requires the authenticated user and looks up the Payment through the server-side `Payment → Registration → User` relationship. It uses the database Payment/Registration status as the authority. The callback's `status` query parameter is not used to determine the displayed result.

The page displays only safe states:

- **Payment successful. Your tournament registration is confirmed.**
- **Payment verification is still in progress.**
- **Payment was not successful.**

No salt, hashes, raw PayU response, card information, or internal database IDs are shown.

## Free tournaments

Free tournaments continue using the Phase 2.7 flow. They do not enter PayU and may be immediately `CONFIRMED`.

## Logging

Safe events may include:

- internal Payment ID
- merchant transaction ID
- PayU reference ID
- old/new payment status
- verification result

Never log:

- merchant salt
- request secrets
- full hashes
- card information
- CVV
- OTP
- passwords
- raw PayU API responses

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

The Phase 3.2 unit tests cover:

- hosted request hash
- Verify Payment API hash
- response reverse hash
- tampered amount rejection
- invalid hash rejection
- successful `captured` mapping
- successful `auth` mapping
- unknown success-state rejection
- failed/cancelled mapping
- pending mapping
- malformed/negative amount rejection
- payment state transitions
- unique merchant transaction IDs

End-to-end PayU verification should use PayU test credentials and a test PostgreSQL database. Do not use production credentials in automated tests.

## Phase boundary

Phase 3.2 does not implement registration codes, room credentials, tournament joining, payouts, refunds, match results, leaderboards, notifications, chat, or tournament result settlement.
