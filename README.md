# IPO — Initial Pump Offering

**Initial Pump Offering.** Good things start together. Community STONK pools
for timed openings on **Stonk.fun**. Formerly Enigma 2; this is the existing separate
[jaycarson373-tech/enigma2](https://github.com/jaycarson373-tech/enigma2) repository.

**Implemented and tested in an isolated Solana VM. Mainnet deployment and funded
public acceptance are pending. Public deposits remain disabled.**

- Deposit STONK during a locked whole-minute window of 1–60 minutes.
- Enforce a cumulative wallet cap of 0.1–10% of the token supply.
- Atomically create a standard Stonk Token-2022 mint and buy with pooled STONK.
- Claim actual purchased tokens and unused STONK to recorded beneficiaries.
- Use Stonk-native buy/sell builders, explicit wallet review and exact signed-wire recovery.
- SOL funds rent and network fees. The creator's separate 0.02 SOL launch budget
  reimburses observed setup costs; unused budget returns to the creator.

The source is [programs/enigma2](programs/enigma2). The exact compiled release is
[releases/v2/enigma2.so](releases/v2/enigma2.so), with identity/hash/status in
[lib/enigma2-release.mjs](lib/enigma2-release.mjs). It has no Pump execution or fallback.
The retained Enigma 1 source, fixtures and tests are historical references only.
The original [Enigma 1 checkpoint](https://github.com/jaycarson373-tech/enigma-launch/tree/enigma-1)
remains preserved in its original repository.

IPO is the public product name. The repository, reviewed v2 artifact,
account discriminators, deployment seeds, recovery storage keys and activation
flags retain their existing identifiers for compatibility. See
[the current design](docs/DESIGN.md). Screenshots: [desktop](docs/screenshots/ipo-desktop.png),
[mobile](docs/screenshots/ipo-mobile.png), [creation](docs/screenshots/ipo-create.png).

## Run and verify

Node 24. No wallet secret is required for development or tests.

```sh
npm ci
npm test
npm run test:fork
npm run typecheck
npm run build
npm run dev
```

`test:fork` runs the actual pinned Stonk program and exact v2 artifact in LiteSVM,
including both claims, adverse account/rule tests, app buy/sell instructions,
atomic rollback and an actual loader deployment/restart. All balances and keys
in these tests are synthetic. No transaction is broadcast.

To rebuild the artifact, install Rust 1.89.0, Agave/Solana 3.1.10 and SBF platform
tools 1.52, then run:

```sh
NO_DNA=1 cargo-build-sbf --manifest-path programs/enigma2/Cargo.toml -- --locked --jobs 2
cargo test --manifest-path programs/enigma2/Cargo.toml --features no-entrypoint --lib --locked
```

A rebuilt artifact must match the reviewed release hash before deployment. Do not
replace the pinned artifact or upstream fixture without rerunning execution tests.

## Release

`npm run release:preflight` verifies current mainnet, the v2 artifact, the complete
pinned Stonk executable and rent. It only reads. The October 28 conservative
available balance was **1.345707280 SOL**, including a temporary buffer and a
0.02 SOL network allowance; refresh before review. This is separate from STONK
contributions and launch acceptance. No spending is authorized by this estimate.

Development-only `/lab/deploy` is a wallet-owned initial-release console with
exact stage verification, simulation, bounded costs and signed-wire recovery.
It uploads the exact v2 artifact, deploys under the connected wallet's retained
upgrade authority and initializes v2 state. It never enables public deposits.
Both the page and its deployment endpoint are 404 in production.

Before customer activation: verify finalized program/code/authority/config,
publish the reviewed deployment identity, run separately reviewed capped funded
launch/claim acceptance, record finalized receipts, and enable the server write
flag only after those receipts verify. Transactions fit without a lookup table.

Vercel is the owner's selected website host. Configure server-only
`SOLANA_RPC_URL` and `BLOB_READ_WRITE_TOKEN`, and keep `ENIGMA_WRITES_ENABLED=false`
until acceptance. Wallet keys never enter chat, the server or hosting variables.

## Custody

Deposits are final. This release has no failed-launch refund or withdrawal
instruction. Rule/config changes and dependency failures can strand deposits.
A wallet must finalize; no funded automatic keeper is promised. Caps apply to
addresses, not humans. The deployment wallet retains upgrade authority. Stonk's
program has its own authorities. Rounding dust stays in the vault. No independent
audit or guaranteed launch result is claimed.

See [mainnet status](docs/ENIGMA_2_MAINNET.md) and [release evidence](docs/ENIGMA_2_RELEASE_PLAN_2026-10-28.json).
