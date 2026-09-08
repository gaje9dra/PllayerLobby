# Prize Settlement & Winner Verification

Phase 4.3 prepares prize entitlements; it does not pay money.

## Workflow

1. Tournament results are VERIFIED.
2. Prize configuration is FINALIZED.
3. Tournament is COMPLETED.
4. Admin reviews the read-only settlement preview.
5. Admin generates PENDING settlement records.
6. Admin reviews and explicitly APPROVES valid pending settlements.
7. A PENDING settlement may be CANCELLED with confirmation; the record remains in history.

`APPROVED` means the platform has approved an entitlement. It does not mean a payout occurred.

## Authoritative data

Settlement amount is copied server-side from `TournamentPrize.amount`. Clients cannot submit or override amount, winner, currency, or settlement status. A settlement stores its rank, amount, currency, tournament, prize, registration, and result references as a financial snapshot.

Only FINALIZED prizes, VERIFIED results, and CONFIRMED registrations can produce settlements, and only for COMPLETED tournaments. Missing or disqualified winners create no settlement and are not automatically redistributed.

## Idempotency and integrity

`prizeId` and `resultId` are unique in the settlement table. Generation runs in a serializable transaction and safely handles duplicate/concurrent requests. Re-running generation returns existing settlement state instead of creating a duplicate.

Reconciliation checks tournament/prize/registration/result relationships, rank, amount snapshot, currency, winner state, and totals. It reports discrepancies without mutating financial records.

Verified results with active settlements cannot be disqualified until a pending settlement is cancelled, preventing silent changes to an approved entitlement. Approved settlements cannot be cancelled or modified.

## Admin route

`/admin/tournaments/[id]/settlements` is ACTIVE ADMIN-only. It shows tournament state, prize configuration, potential prizes, generated settlement total, pending/approved/cancelled counts, unassigned prizes, a read-only preview, settlement records, and reconciliation status.

No settlement data is exposed publicly. No registration codes, room credentials, payment secrets, card data, CVV, OTP, or authentication secrets are selected by the settlement service.

## Currency

The current platform currency is INR. Backend financial logic stores currency explicitly as `INR`; no payout transfer is performed.

## Scope boundary

This phase deliberately does not implement wallets, balances, withdrawals, UPI/bank/PayU payouts, payout APIs/webhooks, automatic transfers, refunds, TDS/tax, KYC, bank-account or UPI-ID storage, or actual settlement payment.
