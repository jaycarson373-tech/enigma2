# Enigma 2 — Launch on Enigma.

## Current direction: Enigma 2 — Stonk.fun only

Checkpoint **Enigma 1** is saved in `jaycarson373-tech/enigma-launch`,
on branch `enigma-1` at
`5a43124fda9e91a79d8b1ffbbfdab7204885e018`.
Enigma 2 has its own repository, `jaycarson373-tech/enigma2`, on `main` with
fresh history. It is the Stonk.fun-only development line.
Its execution technology is Stonk.fun's official Raydium LaunchLab integration;
Pump.fun launch/trade execution and fallback are outside v2 scope.
See [the Enigma 2 specification](docs/ENIGMA_2.md).
The owner selected STONK-token pooling. The funding wallet will be supplied
later. See [mainnet preparation status](docs/ENIGMA_2_MAINNET.md).

This repository establishes the version split and implementation direction.
The inherited application/program below still implement Enigma 1. Stonk
execution has not been ported or validated, and this is not a v2 release.

## Enigma 1 implementation reference

Original black/ice/cobalt launch terminal. New independent Pinocchio Rust program,
informed by Sequence's public documented model and public instruction/account
interfaces. No private backend/source access was used. This is not a partnership
or an independent security audit. Sequence's closed program is no longer an
execution dependency. Its existing accounts and liabilities are not migrated.

Product: publish a SOL pool, deposit during a locked whole-minute 1–60 minute
window, enforce per-wallet token caps, then atomically create a Pump.fun mint and
make the pooled first buy. Claim actual purchased tokens and unused SOL by locked
curve weights. No added Enigma fee. Initial curve reserves and a 95% minimum fill
are enforced. Actual purchased tokens cannot exceed the no-fee cap reference.

Deposits are final/non-refundable. The creator separately supplies 0.02 SOL for
creation; observed setup rent is reimbursed to the finalizer and unused creation
budget returns to the original creator. Anyone can finalize or pay a claim, but
only the recorded beneficiary receives tokens/change. No automatic funded keeper
is promised. Caps apply to wallets, not unique humans. Dust stays in the vault.
There is no withdrawal/sweep instruction; an upgrade authority remains a trust
boundary and must be chosen/published at deployment. Pump dependencies can change
or fail; this can strand deposits. Do not claim guaranteed fairness or returns.

Current release manifest: lib/enigma-deployment.mjs, built-not-deployed. Public
writes remain false. Compiled artifact: releases/v1/enigma.so. Source and local
VM acceptance tests are committed. A program flag alone cannot activate an
undeployed/unreviewed contract. No mainnet spending is authorized by these notes.

State shapes retain public wire compatibility where practical, with an explicit
v1 suffix that the independent client validates. Legacy Sequence fixture tests
use createProtocol(program,{independent:false}); the app uses Enigma v1 only.
Original/replacement authority and asset accounts must never be conflated.

See docs/RELEASE.md, programs/enigma/README.md and docs/DESIGN.md. Preserve exact
wallet/program-scoped signed-wire recovery, metadata upload, wallet connection,
trade builders and unknown-outcome reconciliation. Lendr and other projects stay
paused. Mainnet assistant writes require specific authorization and a spending cap.

Latest product refinement makes the launchpad identity explicit, adds a functional
homepage window selector and refines discovery/create presentation. This is a
UI-only upgrade; financial code, program artifact and activation remain unchanged.

Current homepage direction is Enigma Scope: totals above dense three-stage
discovery. The hero dial is now an optional Create control. Local-only visual and
wallet deployment tools are 404 in production. See the latest RELEASE section.
The initial deployment runner derives addresses from the funding wallet; that
wallet is the default retained upgrade authority. No extra signer secret or
Sequence backend is required. Public deployment and funded acceptance remain
unperformed; do not describe pre-funding tests as mainnet execution.

October 26: repeated public banners removed; one concise launch availability state
remains. Missing simulation evidence now fails closed. Latest checks: 22 application,
2 independent-program VM and 1 loader-deployment VM tests, typecheck/build, audit
and live metadata upload passed. See docs/MAINNET_ACCEPTANCE.md. No program or
economic change; public deployment/funded acceptance and activation remain pending.
