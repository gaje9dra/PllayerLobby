# PayU Payout Processing — Phase 5.5

Phase 5.5 adds PayU Payouts as the external provider for approved PlayerLobby withdrawals. It is separate from the existing PayU payment-gateway integration used for tournament entry payments.

## Current PayU documentation used

The implementation follows the current PayU Payouts documentation for authentication, single transfer, transfer status, beneficiary registration, VPA validation, and webhooks. PayU's current initiation response can mean that the request is accepted for processing; it is not treated as final payment success.

## Environment

Development defaults to `PAYU_PAYOUT_ENVIRONMENT=TEST`. Production additionally requires `PAYU_PAYOUT_PRODUCTION_ENABLED=true`. Production credentials are never used by development code automatically.

Required server-only variables:

- `PAYU_PAYOUT_ENVIRONMENT`
- `PAYU_PAYOUT_MERCHANT_ID`
- `PAYU_PAYOUT_CLIENT_ID`
- `PAYU_PAYOUT_CLIENT_SECRET`
- `PAYU_PAYOUT_WEBHOOK_SECRET`
- `PAYU_PAYOUT_PRODUCTION_ENABLED`

No payout secret is prefixed with `NEXT_PUBLIC_` or exposed to the browser.

## Authentication

The client uses PayU's private Client ID + Client Secret OAuth flow with the `create_payout_transactions` scope. Access tokens are cached in server memory until shortly before expiry. Concurrent token requests share one promise to avoid token storms. A 401 clears the cache and retries authentication once. The current private-client flow does not require a stored refresh token, so the application re-authenticates with the server-only client credentials when the access token expires.

## Beneficiaries

`PayoutBeneficiary` maps a PlayerLobby `PayoutDestination` to a PayU beneficiary ID. The mapping is unique per destination/provider. A pending beneficiary creation blocks another registration attempt until it can be reconciled; the system does not blindly create duplicates.

The actual transfer uses the verified immutable withdrawal snapshot. The beneficiary mapping is maintained for provider identity and reuse.

## Transfer lifecycle

```text
APPROVED
   ↓
PAYOUT_INITIATED
   ↓
PROCESSING
   ↓
PAID
```

Definitive failure:

```text
PROCESSING → FAILED
```

Reversal:

```text
PAID → REVERSED
```

The PayU initiation response is never interpreted as `PAID`.

## Idempotency and retries

A withdrawal can have only one active payout in `PAYOUT_INITIATED` or `PROCESSING` state. A server-generated `merchantRefId` is unique and limited to PayU's documented 40-character maximum.

Timeouts, network errors, 5xx responses, and malformed/ambiguous provider responses do not trigger an immediate second transfer. The existing merchant reference is reconciled through PayU's transfer-status API first.

A retry is allowed only after a definitive failure. The retry creates a new payout record and a new merchant reference; the old payout remains immutable history.

## Webhooks

Endpoint:

`POST /api/webhooks/payu/payouts`

The handler validates PayU's configured merchant authorization value and payout merchant ID, matches the merchant reference, stores an idempotent event fingerprint, and performs only short database work before returning HTTP 200. It does not make another PayU HTTP request before acknowledging a valid webhook.

Handled transfer events include:

- `TRANSFER_SUCCESS`
- `TRANSFER_FAILED`
- `TRANSFER_REVERSED`
- `REQUEST_PROCESSING_FAILED` is recorded but is not treated as a definitive transfer failure.

The current PayU documentation says valid webhook responses should be returned within 10 seconds and that failed deliveries can be retried. The implementation therefore keeps the webhook path short.

PayU also documents test and production source IPs for webhook allowlisting. This project does not hardcode proxy-sensitive IP enforcement in application code; production infrastructure should configure the current PayU allowlist using trusted source-IP handling.

## Wallet and ledger

Funds remain reserved by the existing withdrawal reservation model while a request is `PENDING`, `APPROVED`, `PAYOUT_INITIATED`, or `PROCESSING`.

Only authoritative PayU success creates the permanent wallet debit:

- type: `DEBIT`
- category: `WITHDRAWAL`
- reference type: `WITHDRAWAL_PAYOUT`
- reference ID: `Payout.id`
- amount/currency: server-side payout values

The debit and `PAID` state transition happen in one serializable transaction and are idempotent.

A definitive failed payout changes the payout/withdrawal to `FAILED`; because the wallet was only reserved, no fake debit-then-credit transaction is created.

A reversal is preserved as `REVERSED`. The original successful payout and ledger history are not silently rewritten, and the system does not automatically create a new payout or automatic wallet credit.

## Reconciliation

`reconcilePayUPayout(payoutId)` compares the local payout with PayU's transfer status. It is intended for ambiguous initiation responses, missed webhooks, and manual admin recovery.

The service detects unresolved/unknown provider status and avoids blind retries. It also protects against local/provider mismatches such as a local final state conflicting with a definitive provider result.

## Privacy

The provider client decrypts payout destination data only server-side when needed for a transfer. Full bank-account numbers and UPI VPAs are never sent to browser UI or logs. Provider responses are reduced to safe metadata such as references, status, error codes, and timestamps.

## Admin controls

- `APPROVED`: Process payout and select UPI or IMPS/NEFT/RTGS according to destination.
- `PAYOUT_INITIATED` / `PROCESSING`: Check PayU status.
- `FAILED`: Retry only after definitive provider failure.
- `PAID`: no retry.
- `REVERSED`: reconciliation required.

Normal users cannot initiate payouts or access admin payout controls.

## UAT testing

PayU recommends testing with test credentials before production. PayU's current test documentation provides test behavior for bank-account transfer responses and a dedicated VPA (`kk@okaxis`) for VPA validation.

Provider-level UAT requires a PayU payout test merchant, credentials, payout activation, and a reachable webhook URL. Without those external provider prerequisites, repository tests can verify security/state/idempotency behavior but cannot prove a real PayU transfer occurred.

## Explicit exclusions

Phase 5.5 does not add another payout provider, crypto/cash payouts, refunds, TDS/tax calculation, KYC providers, Aadhaar/PAN verification, arbitrary wallet editing, or automatic prize redistribution.

Production launch still requires separate legal/compliance review for Indian gaming, payment, KYC, age, tax/TDS, fraud/AML, privacy, PayU terms, and game-publisher requirements.
