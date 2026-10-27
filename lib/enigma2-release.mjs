// Enigma 2 has a distinct release identity. V1 artifacts never satisfy it.
export const enigma2Release = Object.freeze({
  version: 2,
  venue: "stonkfun",
  quoteMint: "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx",
  quoteSymbol: "STONK",
  quoteDecimals: 9,
  launchlabProgram: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
  platform: "4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7",
  status: "implementation-pending",
  program: null,
  codeHash: null,
  artifact: null,
  executionAccepted: false,
});

export const ENIGMA2_BLOCK_REASON =
  "Enigma 2 STONK pooling and Stonk.fun execution are not implemented yet. Wallet actions and deployment are paused.";

export function assertEnigma2Implemented() {
  // Replace this guard only alongside the actual v2 program, client, artifact
  // and lifecycle evidence. No environment flag can activate inherited v1 code.
  throw Error(ENIGMA2_BLOCK_REASON);
}

export function enigma2Readiness() {
  return {
    verified: false,
    writesEnabled: false,
    filingEnabled: false,
    network: "mainnet-beta",
    protocol: "Enigma 2",
    venue: enigma2Release.venue,
    quoteMint: enigma2Release.quoteMint,
    quoteSymbol: enigma2Release.quoteSymbol,
    program: null,
    releaseStatus: enigma2Release.status,
    reason: ENIGMA2_BLOCK_REASON,
    executionAcceptance: "No Enigma 2 Stonk lifecycle execution has passed.",
    checkedAt: new Date().toISOString(),
  };
}
