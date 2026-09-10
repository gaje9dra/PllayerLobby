# PayU Payout Processing — Phase 5.5–5.6

PlayerLobby uses PayU Payouts as the external provider for approved withdrawals. This is separate from the existing PayU payment-gateway integration used for tournament entry payments.

## Provider lifecycle

```text
APPROVED
  ↓
PAYOUT_INITIATED
  ↓
PROCESSING
  ├──→ PAID
  │     ↓
  │   REVERSED
  └──→ FAILED
```

The server enforces this payout state machine. Provider acceptance is never treated as `PAID`.

## Phase 5.6 reconciliation

`reconcilePayUPayout(payoutId)` is the authoritative manual recovery service for ambiguous initiation responses, missed webhooks, and status mismatches. It:

1. loads the immutable payout and merchant reference;
2. queries PayU status using the existing merchant reference;
3. verifies amount/currency when PayU supplies amount data;
4. transitions only through valid payout states;
5. performs wallet accounting in the same serializable transaction as the final payout state;
6. records reconciliation metadata and a sanitized audit event;
7. never creates a second payout for an unresolved result.

Provider states are interpreted as:

- `SUCCESS` → `PAID` and exactly one wallet `DEBIT`.
- `FAILED` → `FAILED` and the withdrawal reservation is released by state transition.
- pending/processing/unknown → remain unresolved; funds remain reserved.
- amount/currency mismatch → `MISMATCH`; no accounting finalization.
- local/provider final-state conflict → `CONFLICT`; no blind accounting action.

## Webhooks

Endpoint: `POST /api/webhooks/payu/payouts`.

Handled transaction events:

- `TRANSFER_SUCCESS`
- `TRANSFER_FAILED`
- `TRANSFER_REVERSED`
- `REQUEST_PROCESSING_FAILED`

Other provider notifications are safely recorded without changing a payout. Transaction events are matched by merchant reference and, where available, provider reference. Webhook events have a unique fingerprint and are stored/processed inside the same transaction as accounting, so a failed transaction rolls back the event and allows a safe provider retry.

`REQUEST_PROCESSING_FAILED` is deliberately not treated as a definitive bank failure. It flags the payout for reconciliation and the provider status must be checked before funds are released or another transfer is created.

## Idempotent accounting

Successful payout accounting is:

- `WalletTransaction.type = DEBIT`
- `category = WITHDRAWAL`
- `referenceType = WITHDRAWAL_PAYOUT`
- `referenceId = Payout.id`

The wallet row is locked before the debit. The existing wallet-transaction uniqueness constraint plus transaction checks prevent duplicate debits from duplicate webhooks, webhook/reconciliation races, retries, delayed provider responses, or application restarts.

A failed payout creates no fake debit/credit pair. Its reserved amount becomes available again because the withdrawal leaves the reservation statuses.

## Reversals

A reversal is only accepted after local `PAID`.

The original payout remains historical and changes to `REVERSED`. Exactly one compensating wallet `CREDIT` is created against the same payout reference after verifying that the original debit exists and matches the payout amount/currency. The withdrawal becomes `REVERSED`.

No automatic new payout is created after a reversal.

## Controlled retry

A retry is allowed only from a definitively `FAILED` withdrawal/payout. It:

- creates a new payout attempt;
- generates a new unique `merchantTransferId`;
- preserves the old payout record;
- links the new payout through `previousPayoutId`;
- never overwrites provider references or old payout history.

Timeouts, 5xx responses, ambiguous responses, and `REQUEST_PROCESSING_FAILED` do not qualify for automatic retry.

## Audit/reconciliation metadata

Each payout stores reconciliation status, last reconciliation time, reconciliation message, and reversal time where applicable. Sanitized payout webhook/audit events store the event type, merchant/provider references, safe payload data, received time, processed time, and payout relation. Secrets, access tokens, full bank details, and full UPI destinations are never stored in these audit payloads.

## Admin controls

- `APPROVED`: process payout with the destination-compatible payment type.
- `PAYOUT_INITIATED` / `PROCESSING`: reconcile/check PayU status; no retry while unresolved.
- `FAILED`: retry through a new payout attempt.
- flagged `PENDING` / `REQUIRED` / `MISMATCH` / `CONFLICT`: reconcile before taking further action.
- `PAID`: no arbitrary “Mark as Paid” control.
- `REVERSED`: historical final state; no automatic retry.

All payout-changing operations remain server-side admin-authorized. Users see only their own withdrawal history with masked destination data.

## Environment safety

Development/staging uses `PAYU_PAYOUT_ENVIRONMENT=TEST`. Production additionally requires `PAYU_PAYOUT_PRODUCTION_ENABLED=true`. Credentials are server-only and `.env` files must remain ignored. Production credentials are not part of Phase 5.6.

## UAT

PayU recommends testing payout integration with test credentials before production. Repository tests cover state transitions, provider-result interpretation, idempotency rules, and accounting invariants. A real PayU UAT transfer still requires an activated PayU payout test merchant, valid UAT credentials, and a reachable webhook URL; repository tests cannot substitute for provider-side UAT.
