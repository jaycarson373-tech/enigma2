# Independent Enigma v1 — October 23, 2026

## Implemented replacement

New Pinocchio Rust program, versioned account state and corresponding Kit client.
No Sequence runtime/backend/address-table dependency. Legacy fixtures and tests
remain separate; no original accounts, claims or liabilities are changed.

- Locked 1–60 whole-minute windows and cumulative 0.1–10% supply wallet caps.
- Offering-specific SOL escrow, checked integer curve weights and budget isolation.
- Atomic official Pump createV2 + buyExactQuoteInV3.
- Actual fill validation, mint/ATA/beneficiary/PDA/owner checks and exact claims.
- Duplicate finalization and duplicate claims rejected by authoritative state.
- Creation budget separate from buying SOL; bounded observed-rent reimbursement
  and unused-budget refund to the creator. No Enigma protocol fee or sweep.
- Original wallet/program-scoped signed-wire recovery, metadata upload, connection
  and trade builders retained.
- UI and docs now describe the independent program and its actual release state.
- Historical Sequence launches never appear as independent Enigma activity.

This reimplements observed mechanics; it is not recovered private source. Deliberate
v1 differences include zero Enigma protocol fee, a 95% minimum no-fee-reference
fill and refunding unused creation budget instead of paying a fixed finalizer
budget. These terms apply only to future v1 offerings, not historical launches.

## Verified locally

- SBF production artifact built: 110,784 bytes, SHA-256
  `99d8cec59e5022b8111df645821412472d8fe24bc534f75930a81adbefde341a`.
- Three Rust unit tests: decreasing curve segments, proportional conservation,
  zero division and checked-overflow rejection.
- Independent LiteSVM tests load actual pinned Pump/Pump Fee/Mayhem programs,
  plus public finalized input-account snapshots. No public transactions.
- Complete cycle: file → two deposits → atomic Pump mint/buy → both claims.
- Received 3,520,918.711316 token units; paid 3,520,918.711315; one raw-unit dust
  remains. These are clearly isolated test values, not public activity.
- Different finalizer from creator: observed setup costs 0.00847852 synthetic SOL,
  unused budget returned to creator, finalizer paid only its network fee.
- Realistic static lookup entries: finalization 952 / 1,232 bytes.
- Reject initialization takeover/reset, invalid duration, missing backer signer,
  zero/late/over-cap deposit, substituted position/vault/beneficiary/token ATA,
  cross-offering vault, early/repeated finalization and repeated claims.
- Test 1-minute, custom 17-minute and 1-hour windows; atomic first-deposit failure
  rolls back the window and transfer, excluding unavoidable network fee.
- Twelve application/recovery tests and TypeScript pass. Vercel production build
  passed for the independent release. Desktop and 390px mobile Create views were
  inspected; the custom 17-minute value and one-hour preset update the review,
  mobile width matches the viewport, and actions stay correctly disabled.
- Solana program autofixer: no findings, no further fix pass required.

The SBF CLI emits an unrecognized-syscall warning for standard symbols; the exact
binary successfully executes those paths in LiteSVM. Public-cluster acceptance
has not been run and is not inferred from this VM result. No independent audit.
GitHub Actions account billing/spend limits prevented prior checks from starting;
local and Vercel results must not be described as a successful GitHub Actions run.

The dependency review also found a nested native bigint-buffer copy that escaped
the existing root replacement. A scoped override now makes SPL layouts resolve
the bounded pure-JavaScript converter. Endian/overflow and actual SPL layout
round-trip tests verify the loaded path; npm audit reports zero vulnerabilities.

## Public deployment remaining

Candidate program `AicdhDHzPx3tyrMarZ77SaDVrixLvNohB9eYaAGdHJFg` is not deployed.
The public manifest stays `built-not-deployed`; production/preview write flags
remain false. Setting a flag alone does not bypass this guard.

Read-only mainnet quote at 2026-10-23 20:18 UTC:

- Program, exact-length ProgramData, config and conservative address-table rent:
  0.571159640 SOL retained.
- Staging buffer: 0.563620920 SOL, temporary/reclaimable in the deployment process.
- Conservative peak including 0.02 SOL network cushion: 1.154780560 SOL.

Quotes change; `npm run release:plan` refreshes them without signing or spending.
A specific deployment spending cap, funded signer and upgrade-authority decision
are still required. After deployment: finalized code/slot/authority verification,
initialize, create a fresh LUT, publish the reviewed manifest, then separately
capped public acceptance before enabling customer actions. No private key needs
to enter chat or the web application.

## Preserved boundaries

User deposits are final/non-refundable. Empty or incompatible pools can strand
funds, including creation budgets. No automatic funded keeper is bundled. Caps
limit addresses rather than humans. Upgrade authority and official Pump program
changes are trust boundaries. Metadata hosting is not immutable storage. These
limitations remain visible in product/operations docs; no audit or funded
mainnet-readiness claim is made.

## Launchpad presentation refinement

Enigma is now explicitly presented as a launchpad, led by “Launch on Enigma.”
The homepage has an original SVG launch-window dial whose presets update the
actual creation form. Discovery is prioritized before activity totals. Header,
empty states, contrast, Create sections, navigation history and social assets
are aligned. Reduced-motion preferences are respected; no animation dependency
or perpetual animation loop was added. Reference notes are in docs/DESIGN.md.

This upgrade changes presentation and UI navigation only. The financial program,
policies, compiled artifact, transaction recovery, deployment manifest and write
pause are unchanged. The existing 12 application tests pass; TypeScript and the
Vercel production build are release checks. Desktop/mobile visual and journey
checks accompany the published interface. A website release does not deploy or
activate the Solana program.

## Pre-funding release preparation and Scope terminal

- Added an initial loader-v3 deployment runner using official loader, System
  and address-table SDK builders. Program and buffer addresses derive from the
  funding wallet plus reviewed-code seeds. No additional keypair or private key
  upload is needed; the funding wallet retains upgrade authority. The old
  candidate remains a placeholder until a wallet-specific release is reviewed.
- Actual isolated loader test uploads all bytes, deploys, initializes, creates
  and extends a fresh table and resumes without further payments. 136 synthetic
  transactions, largest packet 1,112 bytes. No public broadcasts or real funds.
- Read-only upstream preflight checked mainnet genesis and the current Pump,
  Pump Fee and Mayhem executable hashes against the VM fixture pins. Checked
  2026-10-23 21:53 UTC; all matched. Large executables use bounded data slices
  with a header recheck to detect an upgrade during reads.
- `/lab/deploy` and `/api/local-release` are development-only wallet tooling,
  404 in production. They verify canonical stage messages, simulate before
  signing, reject changed messages/extra transfers/priority tips, preserve exact
  signed-wire recovery and reserve a bounded network-fee allowance. They never
  activate customer actions. The console uses the project's own server-side RPC,
  not the shared development read proxy. Wallet approval has not been exercised
  with a funded account and is not presented as public execution evidence.
- The current read-only estimate remains 1.154780560 SOL conservative available
  balance, including temporary buffer rent and a 0.02 SOL fee allowance. Retained
  account deposits total 0.571159640 SOL. Current unreclaimable program/config
  deposits are 0.002174240 SOL, plus actual transaction fees. Recovery of other
  storage requires retained authority and shutdown of the relevant accounts;
  closing the program retires its address. The fee allowance is not a fixed fee.
- Public activation still requires finalized program/code/authority/config/table
  verification, a separately authorized bounded launch/buy/claim acceptance test
  and its receipts. Wallet funding/approval is the remaining external setup;
  funding alone does not establish that the public test has passed.
- Homepage now follows the user's Scope terminal reference: statistics first,
  compact introduction, dense three-stage rows and responsive phone tabs. The
  dial is in Create. Allocation claims and the atomic first-buy gap are explained
  without promising free airdrops, an automatic keeper or elimination of bots.

The compiled financial program and locked economic terms are unchanged. No
mainnet deployment, launch, purchase, transfer or activation occurred in this pass.

The final dependency audit flagged a newly reviewed Zod advisory in Blob's
transitive CLI-config dependency. A scoped override pins its patched 4.6.6
version without replacing the existing Blob API. The final audit/build results
belong to this revision; earlier zero-audit results do not cover later advisories.

## October 24 — header social control and launch status cleanup

Added a coherent SVG X control at the right edge of the terminal, Create,
Portfolio, Docs and Operations headers. ENIGMA_X_URL accepts only a validated
HTTPS X/Twitter profile and publishes the canonical x.com link. The owner supplied @Enigma_markets; it is the default verified-format public
profile, with ENIGMA_X_URL as an optional server-side override.
Phone creation uses an accessible compact plus action so the extra control
fits without losing wallet access.

The reproduced public message was the genuine built-not-deployed status, not a
runtime exception. It is now one compact deployment notice rather than repeated
long explanations above and below the form. Disabled wallet guards remain.
RPC failures now distinguish ordinary data reads, simulation, requests rejected
before submission and unknown broadcast outcomes; a failed balance read no
longer claims a transaction was saved. Original signed-wire recovery is intact.

The existing owner-managed paid Helius RPC was verified on mainnet and configured
server-side for Enigma. The deployed app previously had no SOLANA_RPC_URL and
used the public fallback. Image storage was already configured. No development
proxy or wallet key was copied. Financial writes and the built-not-deployed
manifest remain unchanged.

Fresh read-only preflight on October 24 Toronto verified the artifact and current
Pump/Pump Fee/Mayhem executable hashes. The deployment estimate remains
1.154780560 SOL conservative available balance, including a 0.02 SOL estimated
network allowance and temporary buffer. Retained storage is 0.571159640 SOL;
0.002174240 SOL of program/config deposits has no recovery instruction in this
release. Other storage recovery is conditional on retained authority and account
shutdown, not an immediate or unconditional refund. Public execution has not
been accepted. The X profile is now supplied. The funding-wallet public address is still required;
never put a wallet private key in chat or the hosted frontend.

Twenty application/recovery tests passed. Two full independent-program VM tests
and the real loader-v3 deployment/restart VM test passed. Final build, responsive
screenshots and hosted revision are recorded with this release's delivery. No
mainnet signing, token launch, transfer, trade, program deployment or activation
was performed.

## October 25 deployment-readiness refresh

Re-ran application tests/typecheck, both independent-program VM acceptance tests,
the actual loader-v3 deployment/restart test and the production build. The fresh
read-only mainnet preflight matches the existing artifact and all three pinned
upstream hashes. No upgrade or source-level program change was needed. The
operations page now records the timestamped funding estimate and actual release
stages, so a configuration flag is not confused with deployed execution.
Funding wallet address and user-reviewed deployment remain outstanding.
Public writes stay false. No public mainnet transaction or funding was performed.

## October 26 review and disclaimer cleanup

Removed the repeated homepage/Create and documentation banners. Launch availability
now appears beside the disabled launch action, with deployment details linked.
Material non-refundable deposit terms remain in the exact wallet review and custody
documentation; development fixtures retain their sample-activity label.

Wallet previews now reject missing or malformed simulation evidence, unsafe balance
values and unverified network fees. Exact signed-wire and unknown-outcome recovery
remain unchanged. No program, economics, manifest or activation change was made.

Validation: 22 application tests, two independent-program lifecycle/adversarial VM
tests and one loader-v3 deployment/restart VM test passed; typecheck and production
build passed. Production dependency audit reported zero vulnerabilities. A real
nonfinancial metadata/image upload was publicly readable and created no token.
The read-only mainnet preflight at 2026-10-26T16:56:21.214Z still matches the existing
artifact and pinned upstream executables. No mainnet transaction was signed/sent.

The owner-funded deployment and capped public execution acceptance remain undone.
See MAINNET_ACCEPTANCE.md for the prepared review sequence and cost boundaries.
Public writes and filing stay disabled until the deployed program and acceptance
evidence are verified. Funding wallet public address is the remaining external
input for preparing a concrete deployment review; no wallet key upload is needed.
