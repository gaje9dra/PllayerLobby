# Phase 5.5 — PayU Payouts

This phase adds server-side PayU Payouts processing for approved PlayerLobby withdrawals. It uses PayU Payouts, not the existing PayU payment-gateway integration.

## Provider documentation followed

- Payout integration: https://docs.payu.in/docs/apis-used-for-payouts-integration
- Authentication: https://docs.payu.in/reference/authentication-for-payouts
- Private client token: https://docs.payu.in/reference/generate-token-using-private-client-id
- Single transfer: https://docs.payu.in/docs/single-transfer-integration-for-payouts
- Initiate transfer: https://docs.payu.in/reference/initiate-transfer-api
- Transfer status: https://docs.payu.in/reference/check-transfer-status-api
- Beneficiary creation: https://docs.payu.in/reference/create-or-register-beneficiary-api
- VPA validation: https://docs.payu.in/reference/validatevpa
- Payout webhooks: https://docs.payu.in/docs/payouts-webhooks
- Webhook configuration: https://docs.payu.in/reference/set-webhook-api-payouts

## Environments

Development defaults to `PAYU_PAYOUT_ENVIRONMENT=TEST`.

Test/UAT and production base URLs are centralized in `lib/payu-payout-client.ts`. Production requires both production credentials and the explicit `PAYU_PAYOUT_PRODUCTION_ENABLED=true` safety switch.

Never put payout credentials in `NEXT_PUBLIC_*` variables or the browser.

Required server-only variables:

- `PAYU_PAYOUT_ENVIRONMENT`
- `PAYU_PAYOUT_MERCHANT_ID`
- `PAYU_PAYOUT_CLIENT_ID`
- `PAYU_PAYOUT_CLIENT_SECRET`
- `PAYU_PAYOUT_WEBHOOK_SECRET`
- `PAYU_PAYOUT_PRODUCTION_ENABLED`

## Authentication

The integration uses PayU's private client credential flow. Access tokens are cached in process memory until shortly before expiry. Concurrent token requests share one in-flight promise, preventing token storms. A 401 invalidates the cache and performs one fresh authentication attempt.

Tokens and client secrets are never returned to the browser or stored in the database.

## Withdrawal flow

`APPROVED` → `PAYOUT_INITIATED` → `PROCESSING` → `PAID`.

Definitive provider failure becomes `FAILED`. A PayU reversal becomes `REVERSED` and preserves the original payout history.

The PayU initiation response is never treated as `PAID`. PayU documents that the initiation response can only mean the request is in process; final status is supplied through webhooks and/or the transfer-status API.

## Destination integrity

The payout uses the immutable encrypted destination snapshot stored on the withdrawal. It never substitutes the user's current payout method.

Before initiation the server verifies:

- withdrawal is approved
- user is active
- wallet belongs to the withdrawal user
- destination belongs to the withdrawal user
- destination is verified
- snapshot metadata matches the destination
- snapshot decrypts successfully
- amount and currency remain consistent
- no active payout already exists

UPI withdrawals validate the snapshot VPA with PayU before transfer. Bank withdrawals use the snapshot account number, IFSC, and holder name.

## Beneficiaries

`PayoutBeneficiary` maps a PlayerLobby `PayoutDestination` to a PayU beneficiary ID. The mapping is unique per destination/provider so the application reuses a known beneficiary instead of blindly registering one for every payout.

## Idempotency and retries

Every payout gets a server-generated `merchantTransferId` of at most 40 characters. It is persisted before the external request.

There is a database partial unique index allowing only one `PAYOUT_INITIATED` or `PROCESSING` payout for a withdrawal. A timeout, connection reset, 5xx, or malformed provider response does not create a second transfer; the admin must check PayU status first.

A new transfer is only permitted after a previous payout is definitively `FAILED`. A retry receives a new payout record and a new merchant reference; the old payout remains immutable history.

## Webhooks

Endpoint:

`POST /api/webhooks/payu/payouts`

The handler authenticates PayU's merchant-provided webhook authorization value and checks the configured payout merchant ID. It stores a SHA-256 event fingerprint so duplicate deliveries are idempotent.

Supported financial events:

- `TRANSFER_SUCCESS`
- `TRANSFER_FAILED`
- `TRANSFER_REVERSED`
- `REQUEST_PROCESSING_FAILED`

The webhook performs only short database work and returns quickly. Provider status is never accepted from an unauthenticated request.

## Wallet and ledger

Funds remain reserved while a withdrawal is `PENDING` or `APPROVED`. No permanent wallet debit occurs merely because an admin approves a request or PayU accepts a transfer request.

On authoritative `TRANSFER_SUCCESS`, the payout and withdrawal are finalized together with exactly one `DEBIT / WITHDRAWAL / WITHDRAWAL_PAYOUT` wallet ledger entry. The ledger event is keyed by payout ID and is idempotent.

On definitive failure, the payout becomes `FAILED` and the withdrawal leaves the reservation state. No fake debit-then-credit refund is created.

A reversal preserves the successful payout record and marks it `REVERSED`; the system does not silently recreate a payout or silently rewrite financial history.

## Admin UI

`/admin/finance/withdrawals` now supports:

- approval
- explicit PayU payout initiation
- bank payment type selection: IMPS, NEFT, RTGS
- UPI payment type for UPI destinations
- PayU status check for uncertain/processing payouts
- retry only after definitive failure
- payout references/status/failure information

Full payout credentials and full bank/UPI data are never shown.

## Webhook configuration

Configure the PayU Payout webhook URL in the PayU Payouts Dashboard or using the Set Webhook API. The merchant authorization value configured in PayU must equal `PAYU_PAYOUT_WEBHOOK_SECRET`.

PayU documents current webhook IP addresses separately. Source-IP enforcement is intentionally not guessed through arbitrary client IP headers; production infrastructure should enforce the current PayU IP allowlist at a trusted reverse-proxy/firewall layer after verifying the current provider list.

## Testing

PayU's current test documentation provides test behavior for particular bank account numbers, including success, failure, and pending cases. UPI VPA validation has a documented test VPA. Development must use PayU TEST/UAT credentials.

The repository contains 50 focused payout-rule tests covering payment types, status mapping, retry safety, merchant references, payload integrity, amount validation, UPI/bank separation, and provider retry behavior.

Full provider UAT testing still requires an activated PayU Payout test account, client credentials, payout merchant ID, and configured webhook. Those credentials are not committed to the repository.

## Production blockers

The code is not a claim of legal or production readiness. Before production payouts, complete PayU onboarding and activation, production credential setup, webhook configuration, trusted IP allowlisting, and the platform's separate legal/compliance review for Indian real-money gaming, KYC, age eligibility, tax/TDS, reporting, fraud/AML, privacy, PayU terms, and game-publisher rules.
