# Block — Stonk.fun only

The owner selected Block as the public product name on October 30, 2026.
Keep the existing design, STONK pooling and Stonk.fun-only execution. The repo,
reviewed program identities, financial behavior, recovery keys and release
status remain stable.

Standalone repository: jaycarson373-tech/enigma2, main branch, fresh Git history.
The original Enigma 1 checkpoint is preserved in jaycarson373-tech/enigma-launch,
branch enigma-1, commit 5a43124fda9e91a79d8b1ffbbfdab7204885e018.

Owner selected STONK-token pooling, mint
6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx, nine decimals. SOL is for rent and
network fees. Sole execution venue: Stonk.fun's standard Raydium LaunchLab
platform 4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7. No Pump execution/fallback.

The independent Pinocchio Rust v2 program and client are implemented. Timed
1–60 minute deposits, cumulative wallet caps, locked integer curve weights,
atomic Stonk mint/buy, beneficiary claims, budget reimbursement and quote change
are covered by execution tests using real pinned Stonk bytecode in LiteSVM.
The app's STONK buy/sell builders and the actual loader deployment/restart also
pass in the VM. No public transaction or funded acceptance is claimed.

Current release descriptor: lib/enigma2-release.mjs, built-not-deployed.
Artifact: releases/v2/enigma2.so, 130136 bytes, hash
c57c1938c3027c87ca18f1d230399ea500a48417f2d251a1f1ae112e7985ef4e.
The candidate program identity is for local tests, not a public deployment.
The owner's wallet derives the actual deployment identity and retains authority.

The owner will supply the funding wallet later; do not ask for it repeatedly.
The owner selected Vercel using the existing setup. Verify hosting account access,
server RPC and metadata storage before publication. Do not migrate or unpause
another project. Do not request wallet keys or seeds.

Public writes remain off until finalized code/authority/config verification and
separately capped funded acceptance with finalized launch/claim receipts.
An environment flag alone cannot bypass chain evidence. Mainnet assistant sends
require specific authorization and a cap; preparing wallet-controlled transactions
and read-only quotes is intended. No such assistant spending is authorized now.

Deposits are final/non-refundable. The creator's separate 0.02 SOL launch budget
reimburses observed costs; unused budget returns to the creator. There is no
operator sweep, withdrawal or automatic funded keeper. Rule/config changes can
strand funds. Wallet caps do not establish human uniqueness. Upgrade authorities
and hosted metadata are explicit trust boundaries. No independent audit claimed.

Preserve exact-wire, wallet/program-scoped recovery and unknown-outcome
reconciliation. Keep integer base units. Historical v1 source/tests/artifacts
remain references only and must never become a v2 execution fallback.

Read README.md, docs/ENIGMA_2_MAINNET.md and docs/RELEASE.md.
