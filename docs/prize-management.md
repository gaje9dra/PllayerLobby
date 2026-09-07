# Tournament Prize Management

Phase 4.2 defines and records tournament prize allocations without making any payments.

- `Tournament.prizePool` is authoritative.
- Prize positions belong to tournament ranks and have exact monetary amounts.
- Draft allocations may be edited, but their total must not exceed the configured prize pool.
- Finalization requires a complete allocation whose total exactly equals `Tournament.prizePool`.
- Finalized allocations are immutable through ordinary editing.
- Only verified tournament results for confirmed registrations qualify in the allocation preview.
- Missing or disqualified result ranks remain explicitly unallocated; prizes are never silently redistributed.
- Ties are not supported because Phase 4.1 does not support duplicate official ranks.
- No wallets, withdrawals, payouts, refunds, tax deductions, settlement, or payout webhooks are implemented in this phase.
