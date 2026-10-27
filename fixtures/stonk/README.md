# Stonk venue read snapshot

`venue-snapshot.json` records public Stonk pricing and six finalized mainnet
account reads on October 27, 2026. The JSON includes its slot and pricing time.
There are no signatures, private keys, funded test transactions or Enigma 2
execution results. Tests deliberately use that recorded time; current live
checks must fetch fresh pricing with `npm run preflight:stonk`.

The snapshot's API allowlist flags differ from the finalized platform account:
the API says required; onchain `restrictGlobalConfig` is zero and the derived
allow-config account is absent. Verification records both facts and applies
onchain enforcement. Tests also enforce rejection when the restriction is on
and its account is absent. Never infer permanent venue eligibility from this
historical snapshot.
