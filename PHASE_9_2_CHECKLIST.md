# Phase 9.2 Checklist — Tournament Creation & Configuration

## Admin creation

- [x] Admin can create tournaments.
- [x] Tournament form loads games from Game Management.
- [x] Only active games are selectable.
- [x] Tournament name validation is server-side.
- [x] Description and rules are configurable.
- [x] Entry fee uses Prisma Decimal storage.
- [x] Prize pool uses Prisma Decimal storage.
- [x] Participant limit is positive and bounded.
- [x] Banner URL is restricted to HTTP(S).
- [x] Registration opening is configurable.
- [x] Registration closing is configurable.
- [x] Tournament start is configurable.
- [x] Registration start < registration end < tournament start.
- [x] Existing application timezone utilities are reused.
- [x] New tournaments start as DRAFT.
- [x] Drafts are not publicly visible.

## Publishing and lifecycle

- [x] Publishing is a separate admin action.
- [x] Publishing validates stored tournament configuration server-side.
- [x] Inactive games cannot be published.
- [x] Only DRAFT tournaments can be published.
- [x] Publish transition is DRAFT → UPCOMING.
- [x] Existing lifecycle rules remain authoritative.
- [x] Cancellation is non-destructive.
- [x] Used tournament history is preserved.

## Admin list

- [x] Tournament list uses pagination.
- [x] Search by name works.
- [x] Search by slug works.
- [x] Search by UUID works.
- [x] Game filter works.
- [x] Status filter works.
- [x] Start-date range filter works.
- [x] Sorting works.
- [x] Participant count is displayed.

## Editing safeguards

- [x] Admin authorization is enforced server-side.
- [x] Tournament IDs are validated.
- [x] Game IDs are validated.
- [x] Inactive games cannot be selected for new/updated configuration.
- [x] Participant limit cannot be reduced below current active participant count.
- [x] Financially active entry fee cannot be silently changed.
- [x] Finalized prize pool cannot be silently changed.
- [x] Historical financial records are not rewritten.

## Public information

- [x] Published tournaments are listed publicly.
- [x] Public tournament detail page exists.
- [x] Game is displayed.
- [x] Description is displayed as text.
- [x] Rules are displayed as text.
- [x] Entry fee is displayed.
- [x] Prize pool is displayed.
- [x] Participant count and maximum are displayed.
- [x] Registration window is displayed.
- [x] Start time is displayed.
- [x] Public page excludes draft tournaments.

## Financial isolation

- [x] Creating a tournament does not touch wallet balance.
- [x] Editing a tournament does not touch wallet balance.
- [x] Publishing a tournament does not touch wallet balance.
- [x] Existing PayU system is not modified.
- [x] Existing wallet ledger is not modified.
- [x] Existing settlement architecture is not duplicated.

## Audit and security

- [x] Create action is audited.
- [x] Update action is audited.
- [x] Publish action is audited.
- [x] Cancel action is audited.
- [x] Financially relevant mutations and audit writes use the same transaction.
- [x] XSS-oriented text is rendered safely.
- [x] Admin operations are server-authorized.
- [x] Unrestricted destructive deletion is not provided.

## Tests / CI

- [x] Focused tournament validation/lifecycle tests added.
- [ ] Typecheck passes on the Phase 9.2 commit.
- [ ] Lint passes on the Phase 9.2 commit.
- [ ] Full test suite passes on the Phase 9.2 commit.
- [ ] Production build passes on the Phase 9.2 commit.

Final status remains **IN PROGRESS** until the actual CI run verifies the unchecked build gates.

**Do not start Phase 9.3 automatically.**
