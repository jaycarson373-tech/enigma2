# Enigma 2

Standalone repository:
[jaycarson373-tech/enigma2](https://github.com/jaycarson373-tech/enigma2).
Development uses `main` with fresh Git history. Enigma 1 stays in its original
repository. This source snapshot carries the existing preparation work forward;
fresh repository history does not establish a completed Stonk implementation.

**Enigma 1 checkpoint:** branch [`enigma-1`](https://github.com/jaycarson373-tech/enigma-launch/tree/enigma-1),
commit `5a43124fda9e91a79d8b1ffbbfdab7204885e018`.

**Enigma 2 direction:** Stonk.fun-only execution through its official Raydium
LaunchLab platform. This repository records that scope; the Stonk implementation is
pending. See [Enigma 2](docs/ENIGMA_2.md). The remaining README describes the
inherited Enigma 1 implementation and its verification, not v2 readiness.

The owner selected **STONK pooling**. Run `npm run preflight:stonk` for a
read-only venue-account check; success does not establish mainnet readiness.
V1 deployment/preflight commands are blocked in this repository. The v2 program and
client migration remain outstanding; see [mainnet status](docs/ENIGMA_2_MAINNET.md).

Independent timed-pool launch program and original branded Solana interface.
Create a 1–60 minute deposit window, enforce wallet caps, execute one atomic
Pump.fun mint + pooled first buy, then claim purchased tokens proportionally.

## Current release

**Built and locally tested; public deployment inactive.** This release replaces
Sequence's closed program with new Rust source. It does not use that executable,
backend, address table or upgrade authority. No mainnet launch is claimed.

- Independent Pinocchio program: [source](programs/enigma/src/lib.rs).
- Public candidate identity/hash: [manifest](lib/enigma-deployment.mjs).
- Compiled artifact: [Enigma v1](releases/v1/enigma.so).
- Full isolated execution: `npm run test:independent` after SBF build.
- Read-only deployment estimate: `npm run release:plan`.
- Current upstream code checks and rent quote: `npm run release:preflight`.
- Actual isolated loader/deployment/recovery check: `npm run test:release`.

## Interface

Dense original launchboard, wallet-standard connection/disconnect, Launch Lens,
search/watchlist, image/metadata upload, lowercase tickers, capped first deposits,
exact wallet review, SOL curve trades and signature-first recovery. Unknown
outcomes never silently request another payment. Historical Sequence accounts and
synthetic VM transactions are never shown as Enigma activity.

## Development

Node 24 and Solana CLI 3.1.10 / SBF platform tools 1.52.

```sh
npm ci
cp .env.example .env.local
NO_DNA=1 cargo-build-sbf --manifest-path programs/enigma/Cargo.toml --locked --jobs 1
npm run test:independent
npm test
npm run typecheck
npm run build
npm run dev
```

Native Rust math tests:
`NO_DNA=1 cargo test --manifest-path programs/enigma/Cargo.toml --features no-entrypoint --lib --locked`.
`test:fork` also includes a separate archival Sequence reference test requiring
mainnet reads. It is not the new independent program's acceptance test.

The frontend runs on port 3143. `ENIGMA_WRITES_ENABLED=false` is preserved.
Development filesystem caching is disabled to avoid filling this shared
workstation's disk; production compilation and runtime are unchanged.
A public deployment must pass manifest/code/config/address-table review before
activation. The app needs no user wallet private key. Production RPC and Blob
credentials remain server-only; the shared development RPC is not deployed.

Local development includes `/lab/deploy`, a wallet-controlled initial release
console, and `/lab/visual`, an explicitly labeled synthetic discovery fixture.
Both pages and the local release RPC endpoint are 404 in production. The funding
wallet remains upgrade authority; program and buffer addresses derive from that
wallet and the reviewed code hash, with no second signer secret. The console
does not activate the public site or authorize a token launch/trade test.

## Policy boundaries

No added Enigma fee. Deposits are final; dependency failures can strand funds.
The 0.02 SOL creation budget is separate from buying SOL; unused budget returns
to the creator, and observed setup costs are reimbursed to the finalizer.
Per-wallet caps do not establish human uniqueness. Upgrade authority and Pump
program dependencies remain explicit trust boundaries. No audit is claimed.

See [release notes](docs/RELEASE.md), [program reference](programs/enigma/README.md)
and [design references](docs/DESIGN.md).
