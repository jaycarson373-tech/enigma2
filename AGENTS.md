# IPO (Enigma 2 repository)
IPO — Initial Pump Offering — is the owner-selected public identity as of
October 29, 2026. This supersedes the Openbell proposal. Keep Stonk.fun-only execution.
Keep compatibility identifiers, original checkpoints and transaction recovery intact.
This standalone repository is the former Enigma 2: Stonk.fun-only technology. The working
branch is main. Read docs/ENIGMA_2.md first.
The original jaycarson373-tech/enigma-launch repository's enigma-1 branch
preserves the prior Pump.fun implementation at
5a43124fda9e91a79d8b1ffbbfdab7204885e018. Never overwrite that checkpoint.
Enigma 2 must use Stonk.fun's official LaunchLab platform and verified onchain
rules. Do not add Pump.fun execution or a Pump fallback to Enigma 2. Inherited
v1 code, artifacts and test results are reference material, not a Stonk release.
The owner selected STONK-token pooling; SOL is for fees and account rent only.
The funding wallet will be supplied later. Continue code/isolated tests without
requesting it again. Read docs/ENIGMA_2_MAINNET.md for the current engineering gap.
Read PROJECT.md and docs/RELEASE.md. Apply Matthew's Project Optimizer standard.
Keep allocations, deposits and fees in integer base units. Preserve exact-wire,
wallet-scoped recovery and known-outcome reconciliation. Mainnet reads and
wallet transaction preparation are intended; the assistant must not spend funds
or send public transactions without specific authorization and a cap. Enigma 2 is an independent STONK Rust program. Its public deployment is not activated.
Keep the built-not-deployed manifest and write pause until reviewed activation.
Reject unexpected program upgrades. Never present historical Sequence activity
as Enigma-originated activity or fixtures as real users. Preserve legacy tests
separately from the independent program tests.
Do not unpause Lendr or any other project. Read bundled Next docs before changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
