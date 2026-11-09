# PlayerLobby Aviator — Provably Fair System (Phase 10.3)

## Purpose

Every Aviator round publishes a cryptographic commitment before play and reveals the server seed after settlement. The documented algorithm is independently reproduced in the browser verifier.

## Inputs and commitment lifecycle

Each round stores a cryptographically random 32-byte server seed, its SHA-256 hash, the public shared client seed `playerlobby-aviator-v2`, a unique positive nonce, and algorithm version `v2`. The server seed is encrypted at rest and is never sent before settlement.

```text
Generate server seed → publish SHA-256 commitment → run round
→ derive crash point → settle → reveal seed → browser verifies
```

## Exact v2 outcome distribution

The HMAC-SHA256 input key is the server seed. Separate domain-separated messages are used for band selection and the multiplier point:

```text
base = clientSeed + ":" + nonce
band digest  = HMAC-SHA256(serverSeed, base + ":band")
point digest = HMAC-SHA256(serverSeed, base + ":point")
```

Each 256-bit digest is converted to an integer. Rejection sampling removes modulo bias before mapping it to an integer range. The band selector maps an unbiased integer from 0 through 999 into these mutually exclusive bands:

| Crash multiplier | Probability | Bucket count |
|---|---:|---:|
| 1.01x–2.49x | 80% | 800 / 1,000 |
| 2.50x–4.99x | 15% | 150 / 1,000 |
| 5.00x–8.49x | 4% | 40 / 1,000 |
| 8.50x–19.99x | 0.5% | 5 / 1,000 |
| 20.00x–39.99x | 0.4% | 4 / 1,000 |
| 40.00x–119.99x | 0.1% | 1 / 1,000 |

A second independent HMAC-derived integer selects a uniformly distributed hundredth within the selected band. The maximum possible displayed crash is 119.99x; the 120.00x boundary is exclusive.

These are per-round probabilities. They describe the distribution over repeated independent rounds; they do not promise that every finite sample will contain exactly the stated percentages.

## Verification

A result is valid only if both the SHA-256 commitment and the complete v2 crash calculation match. The browser verifier independently repeats the same rejection sampling, band selection, and point selection. Only v2 is supported by the active server and browser verifier. Records created under v1 are not recalculated or rewritten, but their old algorithm is no longer available for verification in this application.

## Security boundaries

- Never expose the server seed before settlement.
- Never accept client-provided server seeds, crash points, nonces, or algorithm versions.
- Do not silently rewrite historical round results.
- Admin-triggered busts are separate operator actions and must remain disclosed to players; they are not represented as naturally generated v2 outcomes.
