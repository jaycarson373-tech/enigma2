# Product and release refinement — October 25, 2026

## Product copy

**Pool SOL for a timed opening.**

Explains the 1–60 minute window, wallet cap and locked launch terms. Added an opt-in cache-free verification build while hosted caching stays unchanged.

Obscura's action-first interface was inspected as a quality reference. Existing product identities, SVG/icon systems and financial policies are preserved; its branding and cryptographic privacy claims are not copied. No dependency or protocol instruction changes were needed for this copy pass.

## Verification

Commands: `npm test; npm run typecheck; npm run test:independent; npm run test:release; BUILD_DISABLE_CACHE=true npm run build`. The portfolio handoff records actual exit codes, test counts, screenshots and exact revisions; these commands alone are not mainnet acceptance. Desktop and 390px layouts are checked separately from financial execution. GitHub-hosted checks may remain blocked by account billing; local checks are not reported as hosted CI.

## Activation and remaining work

Reviewed funding wallet/program deployment and capped public commit/create/claim lifecycle acceptance. Wallet caps are not Sybil resistance; no unattended finalize keeper is bundled.

No mainnet signing, transfer, launch or financial activation occurred in this refinement. Existing pauses, immutable terms, journals, liabilities, archived obligations and key ownership remain unchanged. No LARP reassessment was run. Secrets belong in the relevant deployment's server environment, never the frontend or chat.
