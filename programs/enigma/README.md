# Enigma v1

Independent clean implementation of the public timed-pool model. It does not use
Sequence's executable, backend, upgrade authority or address table. The original
public ABI was examined to understand its behavior; new Rust source is provided.
It is not an audit or a claim of original-source recovery.

## Instructions

- `initialize`: actual upgrade authority only. Verifies the loader's Program /
  ProgramData states, canonical addresses and authority. One initialization.
- `pause`: authority can pause **new filings only**. No withdrawals, fee changes,
  cap changes or modification of existing pools.
- `file`: locks creator/metadata, SOL quote, 1–60 whole-minute duration, 0.1–10%
  supply cap, initial Pump reserve snapshot and 0.02 SOL creation budget.
- `commit`: before close, signed SOL transfer to this offering's isolated vault.
  No-fee constant-product weights allocate earlier and later curve segments;
  cumulative wallet weights cannot exceed the cap. No arbitrary token quotes.
- `launch`: permissionless after close, with a new mint signer. Canonical official
  Pump createV2 and buyExactQuoteInV3 CPIs run atomically. Initial reserves must
  match. Fill must be 95–100% of the no-fee weight. The creation budget reimburses
  observed setup costs only, with its unused balance returned to the creator.
  Total user buying SOL cannot exceed the collected deposit budget.
- `claim`: permissionless fee payer, fixed original backer beneficiary. Pays
  floor(received × weight / totalWeight) and proportional unused SOL. Closes the
  position and returns its rent to that backer. A second claim cannot succeed.

No Enigma protocol fee, operator withdrawal, privileged claim redirect or sweep.
Donations are not counted as deposits. Base-token and SOL rounding remainders
remain in the vault and are not reported as delivered. Deposits and creation
budgets cannot be cancelled; if Pump becomes incompatible, funds can be stranded.
An upgrade authority could replace this code. Secure authority control, public
acceptance and independent review remain necessary deployment decisions.

## Build and test

```sh
NO_DNA=1 cargo-build-sbf --manifest-path programs/enigma/Cargo.toml --locked --jobs 1
NO_DNA=1 cargo test --manifest-path programs/enigma/Cargo.toml --features no-entrypoint --lib --locked
npm run test:independent
npm test
npm run typecheck
npm run build
```

`tests/fork/independent.test.mjs` executes the compiled artifact with actual pinned
Pump/Pump Fee/Mayhem code and finalized public account snapshots in LiteSVM.
Synthetic wallets, lookup tables and all transactions stay inside that VM. No
fixture is published as activity. `tests/fork/protocol.test.mjs` is a separate
archived Sequence reference test, not the independent program's acceptance test.

Run `npm run release:plan` for a current read-only mainnet rent quote. It never
signs, sends or activates anything. Candidate identity and code hash are public in
`lib/enigma-deployment.mjs`. Deploy with max-len equal to artifact length so the
reviewed onchain code hash includes exactly those bytes. A deployment at another
address requires updating the public manifest and rerunning verification.
