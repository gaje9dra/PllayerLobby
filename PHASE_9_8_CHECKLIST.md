# Phase 9.8 — Unique Tournament Access Code System

- [x] Dedicated tournament access-code model with one credential record per tournament
- [x] Secure random generation with ambiguous characters excluded
- [x] SHA-256 verification hash and AES-256-GCM protected admin-retrievable value
- [x] Database uniqueness and collision retry
- [x] Atomic create/replace/revoke operations
- [x] Active/revoked/expired status model
- [x] Admin-only management and masked reveal UI
- [x] Participant verification endpoint with authentication and confirmed-registration eligibility
- [x] Generic failure responses and no submitted-code logging
- [x] Existing rate limiter applied to verification
- [x] Private no-store behavior on sensitive endpoints
- [x] Tournament lifecycle blocks for draft/cancelled/completed access
- [x] Audit events for generation, regeneration, revocation and reveal
- [x] No room credentials returned by access-code APIs
- [x] No access-code data in public tournament responses or URLs
- [x] No changes to brackets, registrations, room credentials, wallet, ledger or PayU flows
- [x] Unit coverage for format, normalization, hashing and random generation
- [ ] Full database/integration/security/concurrency suite verified by CI
- [ ] Production build verified by CI

Phase 9.9 remains intentionally out of scope: the 10-minute access window, room credential reveal/distribution, match result submission, winner verification and prize settlement.
