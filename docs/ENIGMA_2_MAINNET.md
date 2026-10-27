# Enigma 2 mainnet preparation — October 27, 2026

**Not mainnet-ready.** The previous checkpoint established a development
direction, not a Stonk implementation. Supplying a funding wallet alone cannot
complete this release.

## Owner decisions and inputs

- Confirmed: pool STONK, mint
  `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`, nine decimals.
- Confirmed: Stonk.fun is the sole execution venue. SOL is for fees/rent.
- Funding-wallet public address: owner will provide later. The planned wallet
  retains upgrade authority. Code work and isolated tests do not need it.
- Once a distinct v2 artifact and tests pass, prepare a fresh wallet-specific
  deployment quote and separate capped acceptance plan for wallet review. No
  v2 spending amount is requested now; v1's estimate is inapplicable.
- Verify the production server's RPC and metadata-storage access before hosting
  v2. Existing server credentials can be reused where suitable; never put them
  or a wallet seed/private key in source, frontend configuration or chat.

## Completed preparation

- A distinct v2 release descriptor records STONK, the standard Stonk platform
  and LaunchLab program; no v1 program/hash is presented as a v2 artifact.
- Readiness, transaction simulation/submission, local deployment and v1
  funding/preflight entrypoints fail closed in this repository, including when a
  caller supplies a verified state or enables the old environment flag.
- Operations and site metadata identify v2's actual pending state. No obsolete
  Pump deployment estimate is offered as the v2 funding requirement.
- A repeatable read-only Stonk checker validates fresh pricing and finalized
  program/platform/config/mint/curve-rule identities, supported token shape,
  allowlist enforcement, integer reserves and fees. It never signs or submits.
- Public read snapshots and adversarial verification tests are isolated from
  live activity. The October 27 venue report is in
  `ENIGMA_2_VENUE_CHECK_2026-10-27.json`. It explicitly reports that bytecode
  pinning, a v2 artifact and lifecycle/public acceptance are outstanding.

The observed standard rule requires Token-2022 without a transfer-fee extension.
Observed fees are 2,500 protocol + 10,000 platform + 0 creator, each per 1,000,000
(1.25% combined). These are a read snapshot, not locked future fees. API
allowlist flags differed from onchain enforcement; both are recorded.

## Engineering required before funding review

1. Implement STONK SPL escrow and beneficiary claims. Existing Rust `file`,
   `commit`, `launch` and `claim` still assume native SOL and Pump semantics.
2. Implement versioned v2 account state and LaunchLab create/buy CPI with fixed
   official identities, verified configs/rules, atomic mint/buy and actual-fill
   accounting. V1's binary and loader identity are not a v2 release.
3. Bind curve terms, fee bounds and rent budget at the correct review stages.
   Replace Pump reserve/cap assumptions with STONK LaunchLab allocation math.
4. Migrate client instructions, account decoders, metadata, discovery, trade
   builders, receipt verification, market links and wallet reviews to STONK.
   Preserve exact signed-wire recovery and beneficiary/program scoping.
5. Install/pin the Rust/SBF build toolchain in the build environment and produce
   a distinct v2 artifact. This workspace currently has Node but no Cargo or
   SBF compiler. Pin and snapshot upstream executable code for execution tests.
6. Pass isolated full lifecycle and adverse tests: timed window, two depositors,
   per-wallet cap, atomic Stonk launch/buy, both claims, rounding conservation,
   wrong account/owner/program, rule/config changes, replay and restart recovery.
7. Derive the owner-wallet release identity, quote its actual artifact rent,
   prepare exact reviewed deployment stages, verify finalized code/authority/
   config/table, then perform separately reviewed capped public acceptance.
   Public deposits remain disabled until the evidence is complete.

## Validation of this preparation

The application tests cover inherited v1 behavior plus the new v2 release
guards and Stonk read verifier. Passing them does not mean a v2 contract ran.
This preparation passed 29 application tests, TypeScript and the production
build. The production dependency audit reported zero vulnerabilities. Local
production HTTP checks confirmed paused STONK readiness, an empty feed, the
development deployment endpoint returning 404, updated operations content and
rejected transaction submission. A fresh public venue-account check passed.
No Enigma 2 contract execution test, deployment, funded launch, purchase, claim
or activation occurred during this preparation.
