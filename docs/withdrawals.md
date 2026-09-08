# Withdrawal Requests — Phase 5.3

Phase 5.3 adds withdrawal-request recording and admin review. It does not perform an external payout.

## State flow

`PENDING -> APPROVED`

`PENDING -> REJECTED`

`PENDING -> CANCELLED`

Approval is an authorization/review state only. There is intentionally no `PAID`, `COMPLETED`, payout webhook, UPI transfer, bank transfer, or payout-provider integration in this phase.

## Ownership and authorization

User operations derive the user from the authenticated session and derive the wallet from `User -> Wallet`. Client-supplied user IDs, wallet IDs, balances, and currencies are not authoritative. Active users can create requests and cancel only their own pending requests. Only active admins can approve or reject requests.

## Reservation model

The wallet balance is not debited when a request is created. A withdrawal request reserves funds logically while it is `PENDING` or `APPROVED`:

`available for withdrawal = Wallet.balance - SUM(PENDING + APPROVED withdrawals)`

The wallet row is locked with PostgreSQL `FOR UPDATE` inside a serializable transaction before a new request is accepted. This prevents concurrent requests or wallet ledger changes from overspending the same balance. Rejection and cancellation release the reservation by changing status; they do not create a compensating wallet credit or debit.

Approved requests remain reserved because actual payout is a later phase.

## Idempotency

Creation accepts a per-user idempotency key. Reusing the same key with the same amount returns the existing request; reusing it with a different amount is rejected. The database also has a scoped unique constraint.

## Money and limits

Amounts use the existing exact two-decimal wallet money implementation and the wallet currency. The minimum is centralized at `MIN_WITHDRAWAL_AMOUNT` and defaults to `1.00` because the current product specification does not define a higher business minimum. Maximum and daily limits are centralized but disabled (`null`) until a product requirement enables them.

## Eligibility

`checkWithdrawalEligibility()` is reusable and returns structured eligibility information without exposing internal implementation details to the browser. It is designed so future compliance checks can be inserted before approval/payout.

## Admin review

Admin withdrawal management is available at `/admin/finance/withdrawals` with pagination and a status filter. Approval revalidates account status, wallet ownership, currency, request state, and available reserved funds. Rejection requires a bounded reason and preserves the request record.

## Audit limitation

The existing project does not have a general audit-log subsystem. Phase 5.3 therefore preserves `createdAt`, `updatedAt`, `reviewedAt`, `reviewedById`, status, and rejection reason on the withdrawal record instead of introducing a separate audit framework.

## Explicit exclusions

This phase does not store bank-account numbers, IFSC, UPI IDs/PINs, card data, KYC data, tax/TDS calculations, withdrawal fees, refunds, automatic redistribution, payout provider credentials, or external money-transfer data. No external payout API is called.
