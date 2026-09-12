# PayU Wallet Deposit — Phase 8.3

## Scope

Phase 8.3 connects the Phase 8.2 `WalletDeposit` flow to the repository's existing PayU hosted-checkout and server-side verification implementation. It does not alter tournament entry, prize settlement, withdrawals, payouts, or the wallet/ledger architecture.

## Flow

```text
Wallet → Add Money
      → create PENDING WalletDeposit
      → server builds PayU request
      → browser POSTs hosted-checkout fields to PayU
      → PayU POST callback to /api/payu/wallet-deposit/callback
      → validate merchant key + reverse hash
      → call PayU Verify Payment API
      → validate transaction ID + amount + customer/product fields
      → SUCCESS / FAILED / PENDING
      → on verified SUCCESS only:
           WalletDeposit SUCCESS
           + one DEPOSIT WalletTransaction CREDIT
           + wallet balance update
```

## Existing PayU integration reused

The application already had:

- `lib/payu.ts` for PayU environment configuration, checkout/verification URLs and shared hash utilities;
- `lib/payu-hash.ts` for the established SHA-512 request and reverse-response hashing;
- `lib/payu-verification.ts` for server-side `verify_payment` calls and provider status mapping;
- the existing `/api/payu/callback` and tournament payment verification flow.

The wallet deposit integration reuses those utilities instead of introducing another PayU hash or HTTP client implementation.

## Environment

The existing PayU variables are server-side only:

- `PAYU_MERCHANT_KEY`
- `PAYU_MERCHANT_SALT`
- `PAYU_ENVIRONMENT` (`test` or `production`)
- `NEXT_PUBLIC_APP_URL` for callback URL construction

Never expose the merchant salt or other provider secrets through `NEXT_PUBLIC_*`, client JavaScript, logs, or source control. Keep sandbox and production credentials separate.

The existing PayU helper selects:

- test checkout: `https://test.payu.in/_payment`
- production checkout: `https://secure.payu.in/_payment`
- test verification: `https://test.payu.in/merchant/postservice.php?form=2`
- production verification: `https://info.payu.in/merchant/postservice.php?form=2`

## Deposit reference and PayU transaction

`WalletDeposit.reference` is the unique user-facing internal reference and is used as the PayU `txnid`. It has the form `DEP-XXXXXXXXXXXX` and is unique at the database level.

The PayU provider transaction ID (`mihpayid`) is stored separately in `WalletDeposit.providerReference` after server-side verification. This provides an explicit internal-to-provider reconciliation path without using the wallet ID as a payment transaction ID.

## Amount authority

The server reads the amount from the persisted `WalletDeposit` and generates the PayU request from that amount. Callback amounts are normalized and compared against the stored amount. The PayU Verify Payment result is independently compared against the same stored amount.

An amount mismatch rejects the financial operation. No wallet credit is performed.

## Hash/signature validation

The PayU callback must contain the required response fields. The server checks:

1. `key` equals the configured merchant key;
2. transaction ID equals the persisted deposit reference;
3. amount equals the persisted deposit amount;
4. product information equals the generated wallet-deposit description;
5. customer identity fields match the persisted user where present;
6. the established PayU reverse response hash validates with the server-side merchant salt;
7. PayU's server-side Verify Payment response exists and matches the same transaction and amount.

A browser redirect or a `status=success` parameter without a valid provider response/hash cannot credit a wallet.

## Deposit states

- `PENDING`: created or payment state cannot yet be authoritatively finalized. No wallet credit.
- `SUCCESS`: PayU success has been authoritatively verified and the wallet credit/ledger entry committed atomically.
- `FAILED`: PayU failure has been authoritatively verified. No wallet credit.
- `CANCELLED`: user cancelled a pending request. No wallet credit.

If PayU verification is unavailable or uncertain, the deposit remains `PENDING`.

## Atomic wallet credit

Verified success uses `creditVerifiedDepositInTransaction()` from the existing wallet module. It executes in the same Prisma serializable transaction that locks the deposit and updates the deposit state.

The wallet service:

- locks the wallet row;
- validates currency and amount;
- checks the existing ledger reference;
- creates exactly one `CREDIT / DEPOSIT` ledger entry;
- updates the wallet balance.

The deposit is then changed to `SUCCESS` in that same database transaction. If any step fails, the entire transaction rolls back.

The ledger business reference is:

- `referenceType = DEPOSIT`
- `referenceId = WalletDeposit.reference`

This is idempotent under the Phase 8.1 wallet transaction uniqueness constraint.

## Duplicate and concurrent callbacks

A repeated callback for an already-successful deposit returns success without creating another wallet movement.

Concurrent callbacks lock the same `WalletDeposit` row before applying the financial outcome. The wallet is separately row-locked by the wallet transaction boundary. Serializable transactions and the unique ledger reference prevent a second credit.

If a serializable conflict occurs, the callback returns a safe pending result rather than creating a partial financial outcome. A later provider callback/retry can finalize the deposit.

## Failure handling

The callback does not expose stack traces or database/provider secrets. Rejected responses return a generic verification error. Internal logs use the deposit/transaction reference and safe error names rather than secrets.

## User experience

For a pending deposit the user sees:

- amount;
- deposit reference;
- PENDING state;
- `Continue to PayU` checkout action;
- optional mobile number if the account does not yet have one;
- explicit statement that only server verification credits the wallet.

After callback processing, the user is returned to the server-backed deposit page. Refreshing the page reads the current `WalletDeposit` state from the server.

## Testing

Tests cover the shared PayU hash boundary and fake-success rejection. Database-backed integration tests should run against the configured test database for full payment-state and wallet invariants.

Required scenarios:

- valid request hash;
- invalid/tampered response hash;
- fake success without a valid hash;
- transaction mismatch;
- amount mismatch;
- verified success;
- duplicate callback;
- concurrent callback;
- failed payment;
- pending/unknown verification;
- no premature wallet credit;
- exactly one DEPOSIT ledger credit;
- reconciliation after success;
- ownership and unauthorized access;
- refresh/retry;
- abandoned pending payment.

## Sandbox / production safety

Use PayU's sandbox/test environment for development and integration testing. Do not use real money for tests.

Production configuration must use:

- `APP_ENVIRONMENT=production`;
- the real HTTPS application URL;
- production PayU environment and credentials;
- provider callback URLs that resolve to the deployed HTTPS application.

Never commit real credentials. Do not point production at test credentials or localhost callbacks, and do not point development at production secrets.

## Financial invariant

The critical invariant is:

```text
PENDING deposit  -> wallet unchanged
FAILED deposit   -> wallet unchanged
verified SUCCESS -> exactly one wallet credit
repeat SUCCESS   -> zero additional wallet credit
```

Creating a deposit or returning from a PayU browser page is never sufficient to create money. Only authoritative server-side PayU verification may trigger the wallet credit.
