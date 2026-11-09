# Manual Withdrawal Requests

PlayerLobby withdrawals are administered manually. The application never sends a bank or UPI transfer and does not call PayU payout APIs for new withdrawal requests.

## User workflow

1. A user saves a UPI ID or bank account as a payout destination.
2. The user requests a withdrawal against the server-calculated available wallet balance.
3. The amount remains reserved while the request is pending or approved.
4. An active admin reviews the request and the decrypted UPI/bank destination details. Approving also marks that payout destination as verified; rejecting releases the reservation.
5. After approval, the admin sends the exact amount outside PlayerLobby using their bank or UPI application.
6. Only after the transfer succeeds, the admin enters the bank/UPI transaction reference and confirms manual payment in the admin panel.
7. The application atomically records the manual payout, debits the wallet ledger once, and marks the withdrawal PAID. The user sees the paid status and transaction reference.

## State flow

New manual requests use:

`PENDING -> APPROVED -> PAID`

or:

`PENDING -> REJECTED`

Users may cancel only their own pending requests. Approved requests remain reserved until the admin records a successful manual transfer. Rejection and cancellation release the reservation without creating a wallet transaction.

Legacy PayU payout statuses and records remain readable for historical reconciliation. New manual payout records use provider `MANUAL`; no new PayU beneficiary creation, transfer initiation, retry, status polling, or payout webhook is part of this workflow.

## Admin controls and sensitive data

Admin withdrawal management is available at `/admin/finance/withdrawals`. Only an active admin can view the decrypted payout destination snapshot, approve/reject requests, or record a manual payment. The full UPI ID or bank account number is not exposed to normal user-facing views.

The manual payment confirmation requires a 4–128 character bank/UPI transaction reference. It must be entered only after the real-world transfer has succeeded. The reference is stored with the payout record and in the admin audit event. It is not proof from a bank API; the admin is responsible for verifying the transfer in their bank/UPI application before confirming.

## Accounting and concurrency

The wallet row is locked with PostgreSQL `FOR UPDATE` inside a serializable transaction. The payout record, immutable wallet debit, wallet balance update, and withdrawal PAID status commit together or roll back together. The payout row ID is the unique wallet-ledger reference, preventing duplicate debits. The request must still be APPROVED and must not already have a payout record.

`available for withdrawal = Wallet.balance - SUM(PENDING + APPROVED + legacy active payout withdrawals)`

Amounts use exact two-decimal wallet arithmetic. Client-supplied user IDs, wallet IDs, balances, or currencies are never authoritative.

## Security and operational rules

- Never mark a request PAID before the transfer is actually completed.
- Verify the recipient name, destination, and exact amount before sending.
- Never request or store a UPI PIN, OTP, card PIN, or banking password.
- Never manually edit or delete wallet ledger rows.
- If the bank/UPI transfer is pending or uncertain, do not mark it paid. Verify it with the bank first.
- If the destination snapshot cannot be decrypted, do not send payment; resolve the encryption configuration without replacing the key used for existing records.
