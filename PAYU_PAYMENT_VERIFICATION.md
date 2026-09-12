# PayU Payment Verification — Phase 8.4

## Authoritative flow

```text
PENDING WalletDeposit
  -> PayU hosted checkout
  -> POST provider callback
  -> validate merchant key + PayU reverse SHA-512 hash
  -> load internal WalletDeposit by its unique reference
  -> validate transaction identity, amount, currency and customer fields
  -> call PayU Verify Payment API with server-side credentials
  -> validate verified transaction ID, amount and payment state
  -> lock WalletDeposit
  -> credit wallet + create DEPOSIT ledger entry + mark SUCCESS atomically
```

A browser redirect, query parameter, frontend state, or localStorage value never creates wallet money.

## Verification rules

- `WalletDeposit.reference` is the internal PayU `txnid`.
- The persisted deposit amount is authoritative.
- PayU callback amount and Verify Payment amount must match the persisted amount exactly to two decimal places.
- Provider `mihpayid` is stored separately as `WalletDeposit.providerReference`.
- The configured merchant key must match the callback.
- The PayU reverse response hash is validated with the server-side merchant salt.
- The Verify Payment response must contain the same `txnid` and matching amount.
- Customer/product fields are checked against the internal deposit/user where supplied by PayU.
- Only a verified `success` + `captured`/`auth` transaction may credit the wallet.

## State handling

- `PENDING -> SUCCESS` after authoritative successful verification.
- `PENDING -> FAILED` after authoritative failed verification.
- Uncertain provider responses remain `PENDING`.
- `SUCCESS` is idempotent: later valid callbacks do not create another credit.
- A failed deposit is not blindly converted to success; a contradictory provider result requires reconciliation rather than automatic credit.

## Atomicity and idempotency

Verified success is finalized inside one serializable Prisma transaction. The deposit row is locked before financial settlement. The existing wallet service locks the wallet, validates money/currency, creates the immutable `CREDIT / DEPOSIT` ledger entry, and updates the cached wallet balance.

The ledger reference uses the `WalletDeposit.id` UUID. The database uniqueness constraint prevents a second `DEPOSIT` credit for the same wallet/deposit/type/category combination.

`WalletDeposit.providerReference` is unique. Before a successful settlement, the service explicitly rejects a PayU provider transaction already associated with another deposit.

Concurrent callbacks therefore settle the same deposit at most once. A transaction conflict or provider uncertainty is safe: it does not create money and a later provider retry can reconcile the pending deposit.

## Callback endpoint

`POST /api/payu/wallet-deposit/callback` accepts the PayU form callback (and JSON for controlled integrations), validates it server-side, and redirects the browser only after processing to the server-backed deposit status page.

`GET` is rejected. The callback never exposes stack traces, SQL errors, merchant salt, or other secrets.

## Security invariants

The implementation must reject without wallet credit when:

- the callback hash is invalid;
- the merchant key is wrong;
- the internal deposit does not exist;
- the transaction reference does not match;
- the amount does not match;
- the currency is unexpected;
- customer identity/product information does not match;
- PayU Verify Payment does not confirm the transaction;
- the provider transaction belongs to another deposit;
- PayU reports failure or an uncertain state.

## Testing

Phase 8.4 tests cover:

- exact decimal amount normalization without floating-point rounding;
- valid verified success;
- duplicate success callback;
- invalid response hash;
- amount tampering;
- provider transaction reuse;
- failed payment with no wallet credit;
- concurrent verified callbacks with one final wallet credit.

Run the repository CI sequence with PayU sandbox/test credentials only:

```text
npm ci
npm run prisma:generate
npm run db:validate
npm run db:migrate:deploy
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Never place real PayU credentials in source control or tests.
