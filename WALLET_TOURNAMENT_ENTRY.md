# Wallet Tournament Entry — Phase 8.5

## Authoritative flow

```text
Authenticated user
  -> tournamentId only
  -> server loads tournament
  -> server evaluates eligibility + capacity
  -> server reads authoritative entryFee
  -> server reads authenticated user's wallet
  -> wallet ledger debit (ENTRY_FEE / ENTRY_PAYMENT)
  -> registration CONFIRMED
  -> registration code created
  -> response returns server-confirmed remaining balance
```

The entire paid registration is one serializable Prisma transaction. The tournament row is locked first so simultaneous users cannot consume the same final capacity slot. The wallet service then locks the wallet row and performs the debit and ledger write together.

## Financial invariants

For a paid successful registration:

- exactly one wallet debit exists;
- exactly one `ENTRY_FEE / ENTRY_PAYMENT` ledger transaction exists;
- exactly one `Registration` exists for the user/tournament;
- the registration is `CONFIRMED`;
- the wallet balance is never negative;
- the registration, debit and ledger transaction commit or roll back together.

The database uniqueness constraint on `Registration(userId, tournamentId)` and the wallet ledger uniqueness constraint prevent duplicate financial effects. Duplicate/concurrent requests are additionally serialized by the tournament row lock.

## Server-side authority

The client submits only `tournamentId`. The server derives:

- authenticated user from the existing session;
- tournament and entry fee from the database;
- wallet from the authenticated user's `userId`;
- balance from the database;
- eligibility and capacity from the database/current server time.

The client cannot choose `userId`, `walletId`, `entryFee`, debit amount, registration status or payment status.

## Insufficient balance

The centralized wallet service rejects the debit before creating a persistent financial result. Because registration creation and wallet debit share the same transaction, the temporary registration is rolled back as well.

The user receives `Insufficient wallet balance.` and the UI offers the existing `/dashboard/wallet/add-money` flow.

## Exact balance

A balance equal to the entry fee is accepted. The resulting balance is `₹0.00` and the debit is recorded exactly once.

## Free tournaments

A `₹0.00` tournament does not create a wallet debit or `ENTRY_PAYMENT` ledger transaction. Existing tournament eligibility and registration-code rules are preserved.

## Concurrency

### Same user, same tournament

The tournament row lock serializes concurrent requests. The first successful request confirms the registration and debits once; the later request sees the existing active registration and cannot debit again.

### Same wallet, different tournaments

The wallet row lock in the centralized wallet service serializes balance mutations. With `₹100` and two simultaneous `₹100` entries, only one can debit successfully; the other receives insufficient-balance/transaction failure and cannot leave the balance negative.

### Final tournament slot

The tournament row is locked before capacity is checked. Only one concurrent request can consume the last confirmed slot. If another request loses the race, its transaction rolls back its wallet debit/registration work.

## Cancellation compatibility

Phase 8.5 does not invent a refund system. A previously cancelled paid registration with an existing `ENTRY_PAYMENT` debit is not silently reactivated and charged again. It returns a safe `REGISTRATION_NOT_REOPENABLE` result until the existing refund workflow can be applied.

Free cancelled registrations can continue through the existing re-registration behavior.

## Idempotency/reference

Tournament entry ledger references use the registration UUID:

```text
WalletTransaction
  referenceType = ENTRY_PAYMENT
  referenceId   = Registration.id
  category      = ENTRY_FEE
  type          = DEBIT
```

This makes the financial movement traceable:

```text
User -> Tournament -> Registration -> Wallet -> ENTRY_PAYMENT ledger
```

## Rate limiting

The existing database-backed security rate limiter protects tournament-entry attempts at 5 attempts per user/tournament per 60 seconds. Rate limiting is defense-in-depth and does not replace database uniqueness, wallet locking, capacity locking or transaction atomicity.

## UI behavior

Tournament details show the server-provided wallet balance and authoritative entry fee for authenticated active users. The join button uses the database entry fee. After success, the UI shows the server-confirmed remaining wallet balance and registration code.

No client-side balance calculation is treated as authoritative.

## Existing PayU flow

Phase 8.4 PayU verification is not modified. Existing legacy `PENDING` paid registrations remain on their existing PayU flow to avoid creating a second payment claim against the same registration. New tournament joins use wallet balance directly.

## No Phase 8.6 scope

This phase does not implement prize winnings, refunds, withdrawals, prize calculations, a second wallet, a second ledger, or another payment gateway.
