# PlayerLobby Operations Runbook

## Daily operational checks

Review application errors, API latency, database availability, authentication failures, registration failures, payment failures, payout failures, webhook failures, reconciliation mismatches, and withdrawal backlog.

## Payments

Treat the server-side payment record and verified provider response as authoritative. Do not confirm registration from a browser redirect alone. Investigate duplicate, replay, pending, failed, amount-mismatch, invalid-reference, and unknown-transaction cases without manually rewriting historical payment records.

## Payouts

Never blindly retry an ambiguous payout. For `PROCESSING` or unresolved payouts, use the existing reconciliation flow to determine provider state before initiating any new money movement. Keep `PAYOUTS_ENABLED=false` during a payout incident when necessary. This blocks new payout initiation while existing webhook processing and reconciliation continue.

Verify payout and merchant references remain unique and investigate any reconciliation mismatch before enabling new payouts.

## Withdrawals and wallet

Do not manually edit or delete wallet ledger rows. Investigate the source event and use an approved compensating financial operation where supported. Verify reserved funds and available balance before resolving a withdrawal incident.

## Webhooks

Verify webhook authentication/signatures and idempotency. For failed or delayed PayU webhooks, inspect payout audit/reconciliation records and confirm provider status through the supported provider/reconciliation path.

## Security incidents

For compromised credentials, disable affected provider access, rotate credentials through the secret manager/provider, then reconcile uncertain transfers before restoring money movement. Never place secrets in Git or this document.

## Emergency controls

Set `PAYOUTS_ENABLED=false` server-side and restart/redeploy as required by the hosting platform to stop NEW payout initiation. Do not disable webhook processing or reconciliation. Do not reset the production database.

## Backups and recovery

Backups, point-in-time recovery, restore testing, monitoring, and alert routing must be verified with the hosting/database providers. The repository does not claim those external controls are configured.

Follow `docs/PRODUCTION_RECOVERY.md` for database restoration, secret rotation, payout disablement, payment incidents, reconciliation, and rollback procedures.

## Admin operations

Admin authorization is server-side. Use the existing admin flows for tournament, payment, settlement, withdrawal, payout, and audit operations. Do not bypass application controls by manually changing financial records.

## Incident response

1. Preserve logs and financial records.
2. Stop new money movement if required.
3. Determine provider/database/application state.
4. Reconcile in-flight financial operations.
5. Apply the smallest reviewed correction.
6. Verify wallet/ledger invariants.
7. Restore money movement only after the incident is understood.
