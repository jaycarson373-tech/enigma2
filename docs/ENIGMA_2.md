# Enigma 2 — Stonk.fun only

Recorded October 27, 2026 at the owner's request.

Owner decision: pool **STONK**, mint
`6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`, nine decimals.
SOL pays network fees and account rent only. The funding-wallet address will be
supplied later; it is not a prerequisite for implementation or isolated testing.

## Enigma 1 checkpoint

Repository: [jaycarson373-tech/enigma-launch](https://github.com/jaycarson373-tech/enigma-launch).
Branch: `enigma-1`.
Commit: `5a43124fda9e91a79d8b1ffbbfdab7204885e018`.

This preserves the independent timed-pool program, Pump.fun integration, UI,
compiled v1 artifact and release documentation exactly as reviewed. It is built
and locally tested, with public deployment and funded acceptance outstanding.

## Enigma 2 scope

Repository:
[jaycarson373-tech/enigma2](https://github.com/jaycarson373-tech/enigma2).
Development branch: `main`, with fresh history independent of Enigma 1.
Sole execution venue: **Stonk.fun** using its official **Raydium LaunchLab**
integration. No Pump.fun launch/trade execution, venue selector or Pump fallback.
Keep Enigma's identity and timed-pool product direction. Do not silently replace
pooled allocation with a direct creator-only launch.

Use the venue's current pricing and verified onchain platform/config/curve rules.
The existing owned repository `jaycarson373-tech/topblast-stonkfun-launchpad`
contains integration references in `lib/solana/stonk-launchlab.ts` and
`tests/stonk-launchlab.test.ts`. Its recorded standard platform is
`4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7`.
Those references are starting points to reverify, not proof of current deployment
compatibility. Use the supported direct LaunchLab flow, not the retired fee API.

## Original implementation checklist (completed October 28; see current release status)

- Replace the Pump-specific onchain create/buy CPI and client builders with the
  verified Stonk LaunchLab equivalents. Validate actual received tokens, pool,
  vaults, token program, creator and beneficiary identities.
- Rework curve/cap calculations against Stonk's actual supply, reserves and fees.
  Preserve integer accounting, locked terms and bounded beneficiary claims.
- Verify supported quote mint and decimals from pricing and onchain config.
  V1's SOL quote, rent budget and Pump curve constants cannot be assumed for v2.
  Any SOL-to-quote conversion needs an explicit bounded review, never a hidden swap.
- Adapt discovery, pricing, trades, market links and metadata for Stonk only.
  Do not route an unsupported market to Pump.
- Preserve wallet-scoped exact signed-wire recovery and unknown-outcome
  reconciliation. Reject incomplete simulation or changed venue identities.
- Produce a distinct v2 program artifact and release manifest. Verify the full
  timed-pool/deposit/atomic launch-buy/claim lifecycle and adverse cases against
  Stonk dependencies before a separately reviewed deployment and funded test.

## Current status

The independent v2 contract, STONK client, Stonk-native trades and deployment
runner are implemented. The exact v2 artifact passes full lifecycle, adverse and
loader deployment/restart tests in an isolated VM using the real pinned Stonk
program. Public deployment and funded acceptance remain outstanding.

The descriptor is `lib/enigma2-release.mjs`, status `built-not-deployed`.
The artifact is `releases/v2/enigma2.so`. Historical v1 files remain references;
they are not used by v2 APIs or the v2 deployment runner. The read-only release
planner now quotes and verifies v2 exclusively.

The owner chose Vercel and will provide the funding wallet later. See
[mainnet status](ENIGMA_2_MAINNET.md) for current execution evidence, funding
estimate and remaining account/deployment steps.

## Repository separation

The owner requested a fresh GitHub repository for Enigma 2. This repository
starts from a source-only snapshot of the preparation work at
`jaycarson373-tech/enigma-launch@1296b3f8f366451e486bc1185e587a09948b5993`.
It has its own root commit and `main` branch in the owner-created repository
`jaycarson373-tech/enigma2`. No original Git
history, deployment configuration, credentials, installed dependencies or build
cache is carried over. Enigma 1 remains preserved in the original repository.
