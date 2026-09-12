# PayU Wallet Deposit — Phase 8.4

## Scope

Phase 8.4 hardens the existing Phase 8.3 PayU wallet-deposit integration. It keeps the existing wallet, immutable ledger, `WalletDeposit` state machine, hosted checkout, and PayU integration and adds authoritative verification and exactly-once settlement protections.

## Authoritative flow

```text
Wallet → Add Money
      → create PENDING WalletDeposit
      → server builds PayU request
      → browser POSTs hosted-checkout fields to PayU
      → PayU POST callback to /api/payu/wallet-deposit/callback
      → validate merchant key + reverse SHA-512 response hash
      → load persisted WalletDeposit by unique reference
      → validate transaction + amount + currency + customer/product fields
      → call PayU Verify Payment API
      → validate verified txnid + amount + provider state
      → lock deposit
      → verified SUCCESS only:
           wallet credit + DEPOSIT ledger entry + WalletDeposit SUCCESS
           all in one serializable transaction
```

A browser redirect, frontend success state, query parameter, or localStorage value never credits the wallet.

## Existing PayU integration reused

The implementation continues to use:

- `lib/payu.ts` for server-side PayU configuration and endpoints;
- `lib/payu-hash.ts` for SHA-512 request and reverse-response validation;
- `lib/payu-verification.ts` for the PayU `verify_payment` request;
- `lib/payu-verification-rules.ts` for provider-state mapping and exact decimal normalization;
- `lib/payu-wallet-deposit.ts` for wallet-deposit checkout and authoritative finalization.

No second wallet, ledger, payment gateway, or PayU implementation was introduced.

## Environment

Server-side variables:

- `PAYU_MERCHANT_KEY`
- `PAYU_MERCHANT_SALT`
- `PAYU_ENVIRONMENT` (`test` or `production`)
- `NEXT_PUBLIC_APP_URL` for the callback URL

The merchant salt and other private credentials must never be exposed through `NEXT_PUBLIC_*`, client JavaScript, logs, or source control. Development/testing uses PayU sandbox credentials.

## Verification rules

The callback is accepted for financial processing only when:

1. the transaction reference matches an existing `WalletDeposit.reference`;
2. the callback merchant key matches the configured merchant key;
3. the callback reverse hash validates with the server-side merchant salt;
4. the callback amount exactly matches the persisted deposit amount;
5. the callback product information and customer identity match the persisted deposit/user;
6. PayU `verify_payment` confirms the same transaction ID;
7. the verified amount and transaction amount match the persisted deposit amount;
8. the provider state is successful (`success` with `captured`/`auth` unmapped state);
9. a provider transaction ID (`mihpayid`) is available for successful settlement;
10. that provider transaction ID is not already attached to another deposit.

Provider-reported amounts are never used as the source of truth. The persisted server-side deposit amount is authoritative.

## Exact monetary comparison

PayU amounts are normalized as decimal strings rather than converted through JavaScript floating-point `Number` arithmetic. This prevents precision loss at the payment-verification boundary.

## Deposit states

- `PENDING`: payment has not been authoritatively finalized. No wallet credit.
- `SUCCESS`: authoritative PayU success has been verified and the wallet/ledger/deposit update committed atomically.
- `FAILED`: authoritative PayU failure has been verified. Wallet remains unchanged.
- `CANCELLED`: user cancelled a pending deposit. Wallet remains unchanged.

Uncertain PayU verification remains `PENDING` and is safe for later provider retry/reconciliation.

## Atomic wallet credit

Verified success calls `creditVerifiedDepositInTransaction()` from the existing wallet service. The operation runs inside a serializable Prisma transaction and locks the `WalletDeposit` row before settlement.

The wallet service then:

- locks the wallet row;
- validates currency and exact money amount;
- enforces the existing financial-reference idempotency rule;
- creates exactly one immutable `CREDIT / DEPOSIT` ledger transaction;
- updates the wallet balance.

The `WalletDeposit` is marked `SUCCESS` in the same database transaction. Any database error rolls back the complete financial operation.

The ledger reference uses the `WalletDeposit.id` UUID, not the user-facing `DEP-...` string. The existing unique wallet-transaction constraint therefore prevents duplicate successful deposit credits.

## Duplicate and concurrent callbacks

A repeated valid callback for an already-successful deposit returns an idempotent success result and performs no second credit.

Concurrent valid callbacks lock the same deposit before settlement. The existing wallet row lock and unique ledger reference provide a second protection boundary. The final wallet balance can therefore increase by the deposit amount only once.

If a serializable conflict or provider verification failure makes the result uncertain, no partial credit is committed and the deposit remains safe for retry/reconciliation.

## Provider transaction reuse

`WalletDeposit.providerReference` is unique. Before a successful settlement, the service checks whether the PayU `mihpayid` is already associated with another deposit. Such a callback is rejected rather than allowing one provider payment to fund two deposits.

## Callback endpoint

`POST /api/payu/wallet-deposit/callback` accepts the provider callback and processes it server-side. `GET` is rejected.

After processing, the browser is redirected to the server-backed deposit status page. The page reads the current `WalletDeposit` state from the database; the redirect itself does not create financial state.

Callback failures expose only safe generic responses. Merchant salts, SQL errors, stack traces, and provider secrets are not returned.

## Security invariants

The implementation must reject without wallet credit when:

- the callback hash/signature is invalid;
- the merchant key is wrong;
- the deposit reference is unknown;
- the transaction reference is mismatched;
- the amount is tampered;
- the currency is unexpected;
- customer/product information is inconsistent;
- PayU verification does not confirm the transaction;
- the provider transaction is already associated with another deposit;
- PayU reports failure;
- PayU verification is pending/unknown.

## Testing

Phase 8.4 adds coverage for:

- exact decimal normalization for large monetary values;
- valid verified success;
- duplicate success callback;
- invalid response hash;
- amount tampering;
- provider transaction reuse;
- failed provider result with no wallet credit;
- concurrent verified callbacks with one final wallet credit.

Run the repository CI sequence with PayU test credentials only:

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

## Financial invariant

```text
PENDING deposit  -> wallet unchanged
FAILED deposit   -> wallet unchanged
verified SUCCESS -> exactly one wallet credit + one DEPOSIT ledger entry
repeat SUCCESS   -> zero additional wallet credit
```

No production money is used for tests. No Phase 8.5 functionality is included here.
