# Admin Registration & Participant Management

Phase 3.5 adds an operational admin interface for inspecting registrations belonging to a selected tournament.

## Authorization

The registration list, detail page, and cancellation Server Action all call `requireAdmin()`. That helper requires an authenticated user whose database-backed status is `ACTIVE` and whose role is `ADMIN`.

Tournament and registration identifiers are validated server-side. The detail page and cancellation action additionally verify that the registration belongs to the tournament in the route.

## Registration list

Route:

`/admin/tournaments/[id]/registrations`

The list is server-rendered from PostgreSQL with a page size of 20. It supports server-side search, enum-backed filters, allowlisted sorting, and pagination.

Search covers participant name/email, exact registration UUIDs, and merchant transaction IDs. Payment-status filtering uses related payment records.

The list shows participant identity, user status, registration status, latest payment status, amount/currency, timestamps, registration-code status, and tournament-room status.

## Registration detail

Route:

`/admin/tournaments/[id]/registrations/[registrationId]`

The detail view shows participant, tournament, registration, payment history, registration-code metadata, and room metadata.

Payment information is read-only. The page does not provide a manual payment-status control.

## Cancellation

An ACTIVE ADMIN can cancel a `PENDING` or `CONFIRMED` registration when the tournament is not `COMPLETED` or `CANCELLED`.

Cancellation:

- preserves the registration record;
- changes registration status to `CANCELLED`;
- preserves all payment records and their existing status;
- revokes an existing registration code by setting `revokedAt`;
- prevents the existing confirmed registration from satisfying room-access checks;
- does not process or claim to process a refund.

The update is performed server-side in a transaction with a conditional registration update to reduce race-condition risk.

## Secret protection

The admin registration list/detail queries select only safe registration-code and room metadata. They never select `codeHash`, `codeEncrypted`, `roomIdEncrypted`, or `roomPasswordEncrypted`.

No registration plaintext code or room password is rendered by these routes.

## Phase boundary

This phase does not add refunds, payouts, manual payment confirmation, results, scoring, leaderboards, notifications, chat, automatic room assignment, or game API integration.

No audit-log framework was added because the existing project has no audit subsystem. Registration `createdAt`, `updatedAt`, and `status` remain the preserved history available to the current system; dedicated administrative audit logging remains a future concern.
