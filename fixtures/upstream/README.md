# Public upstream snapshots — isolated tests only

Retrieved from finalized Solana mainnet RPC accounts on 2026-10-23. The JSON gzip
files preserve publicly deployed ProgramData account snapshots. Tests load their
code after the 45-byte loader header. `accounts.json` records public input account
snapshots and observed slots. No wallet secrets or signed transactions exist here.

These are pinned historical dependencies, not claims about today's active code.
No Sequence program is invoked by the independent Enigma tests.

SHA-256 of loaded code, including its allocated trailing bytes:

- Pump `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`:
  `7a19affaa2c6187e04a5fe0ea298cee81fa5eb8c24cfcc30d85f615e89f7b02d`
- Pump Fee `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`:
  `4f2955d0f6b40cc9ff7daa18ccad7d19119ba1249759f4e7e3bb691beee6b35e`
- Mayhem `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e`:
  `a87fa9f866272514e6acb852b668c4a08aeb173d56c883039991d114d1199bdb`
