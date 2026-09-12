# Phase 8.5 — Wallet-Based Tournament Entry

## Implementation

- [x] Existing tournament registration flow inspected and reused
- [x] Server derives authenticated user
- [x] Server derives tournament and authoritative entry fee
- [x] Client submits only tournament ID
- [x] Server reads the user's authoritative wallet
- [x] Insufficient balance rejected without financial side effects
- [x] Exact balance accepted
- [x] Free tournaments avoid unnecessary financial debits
- [x] Paid entry uses centralized `recordWalletTransactionInTransaction()` wallet service
- [x] Debit category is `ENTRY_FEE`
- [x] Debit reference is `ENTRY_PAYMENT` with the registration UUID
- [x] Paid registration becomes `CONFIRMED` only inside the same transaction as the debit
- [x] Registration code is created in the same transaction
- [x] Tournament row is locked before capacity validation
- [x] Wallet row is locked by the centralized wallet service
- [x] Serializable transaction isolation is used
- [x] Database registration uniqueness is preserved
- [x] Duplicate/concurrent joins cannot double-charge
- [x] Concurrent spending cannot make the wallet negative
- [x] Final-slot capacity race safely rolls back the losing transaction
- [x] Existing cancellation/refund rules are not invented or bypassed
- [x] Existing PayU verification was not modified
- [x] Existing legacy pending PayU registrations remain on their existing flow
- [x] Existing database-backed rate limiter protects join attempts
- [x] User-safe failure messages are returned
- [x] Tournament page shows server-provided wallet balance and entry fee
- [x] Successful join shows server-confirmed remaining wallet balance
- [x] Add Money action is available for insufficient balance

## Tests added

- [x] Successful paid entry
- [x] Insufficient balance
- [x] Exact balance
- [x] Duplicate/concurrent same-tournament join
- [x] Concurrent spending across tournaments
- [x] Concurrent final-capacity race
- [x] Free tournament has no entry debit

## Required CI validation

- [ ] Prisma generation
- [ ] Prisma validation
- [ ] Prisma migrations
- [ ] Typecheck
- [ ] Lint
- [ ] Full test suite
- [ ] Production build

Do not mark Phase 8.5 complete until the final CI run for the completed implementation reports success for every required stage.
