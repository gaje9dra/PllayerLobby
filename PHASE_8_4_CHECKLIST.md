# Phase 8.4 — PayU Verification & Reliable Wallet Credit

- [x] Reuse existing PayU configuration and SHA-512 utilities
- [x] Validate PayU merchant key
- [x] Validate PayU reverse response hash
- [x] Validate internal deposit reference / PayU `txnid`
- [x] Validate callback amount against persisted deposit amount
- [x] Validate currency
- [x] Validate customer/product fields
- [x] Perform server-side PayU `verify_payment`
- [x] Validate provider transaction identity and verified amount
- [x] Require provider transaction ID for successful wallet credit
- [x] Reject provider transaction reuse across deposits
- [x] Keep uncertain verification PENDING
- [x] Mark verified failures FAILED without wallet credit
- [x] Lock the deposit during settlement
- [x] Use existing atomic wallet/ledger credit service
- [x] Preserve exactly-once DEPOSIT ledger credit
- [x] Protect duplicate callbacks
- [x] Protect concurrent callbacks
- [x] Keep browser redirects non-authoritative
- [x] Keep callback responses free of secrets/internal errors
- [x] Add Phase 8.4 security/integration tests
- [x] Add Phase 8.4 verification documentation

## Required validation before Phase 8.4 is considered complete

- [ ] `npm run prisma:generate`
- [ ] `npm run db:validate`
- [ ] `npm run db:migrate:deploy`
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`

The unchecked items above require execution in the repository environment/CI; they are not claimed as passed merely because the code was changed.
