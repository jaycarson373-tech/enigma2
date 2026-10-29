// Enigma 2 only. Deployment identity is filled after finalized wallet-owned deployment.
export const enigma2Release = Object.freeze({
  version: 2,
  venue: "stonkfun",
  quoteMint: "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx",
  quoteSymbol: "STONK",
  quoteDecimals: 9,
  launchlabProgram: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
  platform: "4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7",
  status: "built-not-deployed",
  program: null,
  programData: null,
  slot: null,
  upgradeAuthority: null,
  lookupTable: null,
  codeHash: "c57c1938c3027c87ca18f1d230399ea500a48417f2d251a1f1ae112e7985ef4e",
  codeBytes: 130136,
  artifact: "releases/v2/enigma2.so",
  isolatedExecutionPassed: true,
  executionAccepted: false,
  acceptance: null,
  upstream: {
    program: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
    programData: "D2QX47Tv2uhNNwFcnLCyJtLMZ4WGmc7eXxvyEmD6zNUh",
    codeHash:
      "4c87da8e9fdeda6daf9d141e409577733d6248ae78f694557176fe2709a09657",
    codeBytes: 2560000,
    slot: "446221802",
  },
});

export const ENIGMA2_BLOCK_REASON =
  "Openbell is built and tested locally. Mainnet deployment and funded acceptance are pending.";
export function assertEnigma2Implemented() {
  if (
    !enigma2Release.isolatedExecutionPassed ||
    !enigma2Release.codeHash ||
    !enigma2Release.artifact
  )
    throw Error("The Openbell v2 artifact and execution tests are incomplete.");
}
export function enigma2Readiness() {
  return {
    verified: false,
    writesEnabled: false,
    filingEnabled: false,
    network: "mainnet-beta",
    protocol: "Enigma 2",
    venue: "stonkfun",
    quoteMint: enigma2Release.quoteMint,
    quoteSymbol: "STONK",
    program: enigma2Release.program,
    releaseStatus: enigma2Release.status,
    reason: ENIGMA2_BLOCK_REASON,
    executionAcceptance:
      "Pinned Stonk VM lifecycle passed; funded public acceptance remains pending.",
    checkedAt: new Date().toISOString(),
  };
}
