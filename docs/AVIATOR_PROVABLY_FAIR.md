# PlayerLobby Aviator — Provably Fair System (Phase 10.3)

## Purpose

Every Phase 10.3 Aviator round has a public commitment that is published before the round starts and a post-settlement reveal that can be independently verified.

This system is a PlayerLobby-specific algorithm. It does not copy a proprietary Aviator/Spribe algorithm or branding.

## Inputs

Each round stores:

- `serverSeed` — 32 cryptographically random bytes encoded as lowercase hexadecimal. It is secret until settlement.
- `serverSeedHash` — `SHA-256(serverSeed)` in lowercase hexadecimal. This is safe to publish before the round.
- `clientSeed` — the public shared client seed `playerlobby-aviator-v1`. Aviator is a multiplayer shared round, so one public client seed is used for the common crash result rather than allowing one bettor to change the shared outcome.
- `nonce` — a positive monotonic counter value with a cryptographically random process-start prefix. The counter increments for every newly created round.
- `algorithmVersion` — currently `v1`.

The browser cannot submit or replace the server seed, nonce, algorithm version, or stored commitment.

## Commitment lifecycle

```text
Generate 32-byte server seed with Node crypto.randomBytes
        ↓
SHA-256(server seed)
        ↓
Persist encrypted server seed + public commitment
        ↓
Publish serverSeedHash/clientSeed/nonce/algorithmVersion
        ↓
Run round
        ↓
Derive crash multiplier from HMAC-SHA256
        ↓
Crash + settle bets
        ↓
Reveal decrypted server seed
        ↓
Browser verifies commitment + crash calculation
```

The raw seed is encrypted at rest with AES-256-GCM using a key derived from `AUTH_SECRET`. It is never included in the pre-round API or commitment WebSocket event.

## Exact v1 crash algorithm

The HMAC message is:

```text
clientSeed + ":" + nonce
```

The digest is:

```text
HMAC-SHA256(
  key = serverSeed,
  message = clientSeed + ":" + nonce
)
```

Take the first four bytes of the digest as a big-endian unsigned 32-bit integer `value`:

```text
value = uint32_be(hmacDigest[0..3])
unit = value / 2^32
```

Map that value into PlayerLobby's supported crash range using the documented quadratic mapping:

```text
crash = 1.01 + unit^2 × (50.00 - 1.01)
crash = round(crash, 2 decimal places)
```

The result is capped at `50.00x` and has a minimum of `1.01x`.

This exact calculation is implemented by `calculateAviatorCrashMultiplier()` and reproduced independently in the browser verifier. The verifier does not call the game-engine generator.

## Verification

A completed round is valid only when both checks pass:

1. `SHA-256(revealedServerSeed) === serverSeedHash`
2. The v1 HMAC calculation using `serverSeed`, `clientSeed`, and `nonce` reproduces the stored `crashMultiplier`.

If the algorithm version is unsupported, verification is unavailable rather than falling back to another calculation.

## Public APIs

### Current commitment

```text
GET /api/games/aviator/fairness/current
```

Returns only:

```json
{
  "roundId": "...",
  "serverSeedHash": "...",
  "clientSeed": "playerlobby-aviator-v1",
  "nonce": "...",
  "algorithmVersion": "v1"
}
```

The `serverSeed` is intentionally absent.

### Completed-round reveal

```text
GET /api/games/aviator/fairness/:roundId
```

Only a settled round with fairness metadata can return the reveal. Older rounds without Phase 10.3 metadata return `FAIRNESS_DATA_NOT_FOUND`.

The response contains the revealed seed, commitment inputs, crash multiplier, and a server-side diagnostic. The `/games/aviator` UI additionally performs the same calculation locally in the browser.

## WebSocket events

Before/during a round:

```text
fairness:commitment
```

The commitment event contains only public verification data.

After settlement:

```text
fairness:revealed
```

The reveal event is emitted only after settlement and contains the seed and completed-round verification inputs.

## Immutability

A database trigger prevents fairness inputs from being changed once a round leaves `WAITING`. Historical fairness data is therefore not silently replaced after the result has been determined. Existing pre-Phase-10.3 rounds remain without invented fairness metadata.

## Test vector

```text
serverSeed      = test-server-seed-32-bytes
serverSeedHash  = 5e35d1f2f093c39b78b96fc97a7f760ffede7c16eeda6e10d6bcf972a9178d81
clientSeed      = playerlobby-aviator-v1
nonce           = 12345
algorithm       = v1
HMAC-SHA256     = d6af29066075434763cdc07324c87bb0552183d2f3f650b8883dcfb78a500e79
crashMultiplier = 35.46x
```

This vector is locked into automated tests so a future refactor cannot silently change the v1 calculation.

## Security boundaries

- Do not log server seeds.
- Do not include server seeds in pre-round responses.
- Do not include server seeds in commitment WebSocket events.
- Do not accept client-provided server seeds, crash multipliers, nonces, or algorithm versions.
- Do not label a round verified merely because fairness metadata exists; perform both verification checks.
- Do not fabricate fairness data for rounds created before Phase 10.3.

The system provides cryptographic evidence that the revealed seed matches the pre-round commitment and that the stored result follows the documented v1 calculation. It does not make unsupported claims that every operational component of a game can never be manipulated.
