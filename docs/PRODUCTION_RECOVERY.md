# PlayerLobby Production Recovery Runbook

## 1. Database restoration

1. Stop or isolate application writes if required by the incident.
2. Use the database provider's documented backup/PITR restoration process.
3. Verify the restored database on an isolated/staging connection before reconnecting production.
4. Run `prisma migrate status` and apply only the committed migrations required by the target application version with `prisma migrate deploy`.
5. Never use `prisma migrate reset` against production.
6. Preserve financial records and investigate wallet/ledger consistency before reopening money movement.

## 2. Secret rotation

Rotate secrets through the hosting provider's secret manager/environment configuration. Rotate at least the affected credential, then restart/redeploy affected services. Never commit secrets or place them in this document.

For compromised PayU credentials, disable affected provider access first, rotate credentials with PayU, and reconcile any uncertain transfers before re-enabling payouts.

## 3. Disable payouts

Set `PAYOUTS_ENABLED=false` server-side and redeploy/restart as required by the hosting platform. This blocks new payout initiation while allowing existing webhook processing and reconciliation to continue.

Do not delete payout records or manually change wallet ledger entries.

## 4. Pause tournament registrations

Use the existing administrator tournament controls to prevent new registrations or cancel/pause an affected tournament where supported. Do not modify historical payment or registration records manually.

## 5. Disable payment processing

If payment processing must be stopped, disable the provider/payment configuration through the controlled hosting configuration process and investigate any in-flight callbacks before restoring it. Do not remove historical payment records.

## 6. Failed PayU webhooks

Check the payout audit/reconciliation records using payout ID and merchant reference. Verify provider status directly through the supported reconciliation path. Do not treat an initiation response as final success and do not blindly retry an ambiguous transfer.

## 7. Reconcile payouts

For `PROCESSING` or otherwise unresolved payouts, use the admin reconciliation flow. Confirm provider status, amount, and currency. Only a definitive provider success may produce the wallet debit. A reversal must be treated as a reconciliation state and credited exactly once according to the application's state machine.

## 8. Deployment failure

1. Keep payouts disabled if the new release is suspected of affecting financial operations.
2. Preserve the database and financial history.
3. Roll back application code through the hosting provider's controlled release mechanism if safe.
4. Do not blindly roll back financial migrations after money movement has occurred.
5. Reconcile all in-flight payouts after application recovery.

## 9. Application rollback

Roll back to a known-good application release. Confirm that the release understands the current database schema before serving traffic. If a database migration introduced an incompatible schema, use a reviewed forward migration rather than destructive rollback when financial data may exist.

## 10. Wallet ledger rule

**Never manually edit, delete, or rewrite immutable wallet ledger transactions to repair an incident.** Investigate the source event and use an approved compensating financial operation where the application supports one.

## Monitoring requirements

The production operator should monitor application errors, API latency, database availability, authentication failures, payment failures, payout failures, webhook failures, reconciliation mismatches, withdrawal backlog, and registration failures.

## Critical alerts

Alert on repeated payment failures, repeated PayU payout failures, webhook authentication failures, payout reconciliation mismatches, wallet/ledger mismatches, database unavailability, unusual registration-code failure spikes, and repeated admin authorization failures.

External monitoring, alert routing, backups, and provider dashboards are hosting/provider responsibilities and are not claimed to be configured by this repository.
