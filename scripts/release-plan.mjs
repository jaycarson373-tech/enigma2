// Read-only deployment planning. Never signs, sends or edits activation flags.
import { assertEnigma2Implemented } from "../lib/enigma2-release.mjs";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deployment } from "../lib/enigma-deployment.mjs";
import { lookupAddresses } from "../lib/lookup-addresses.mjs";
assertEnigma2Implemented();
const helper = "/Users/Matthew/.codex/bin/solana-rpc.mjs";
async function read(method, params = []) {
  if (existsSync(helper))
    return JSON.parse(
      execFileSync(process.execPath, [helper, method, JSON.stringify(params)], {
        encoding: "utf8",
      }),
    ).result;
  const response = await fetch(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const body = await response.json();
  if (body.error) throw Error("Read-only RPC quote failed");
  return body.result;
}
const code = readFileSync(new URL("../releases/v1/enigma.so", import.meta.url));
const hash = createHash("sha256").update(code).digest("hex");
if (hash !== deployment.codeHash)
  throw Error("Artifact does not match the reviewed manifest");
if (
  (await read("getGenesisHash")) !==
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
)
  throw Error("Wrong cluster");
const lookupCount = (await lookupAddresses()).length + 9; // room for current Pump fee recipients
const sizes = {
  program: 36,
  programData: 45 + code.length,
  stagingBuffer: 37 + code.length,
  config: 136,
  addressTable: 56 + 32 * lookupCount,
};
const rent = {};
for (const [k, n] of Object.entries(sizes))
  rent[k] = BigInt(
    await read("getMinimumBalanceForRentExemption", [
      n,
      { commitment: "finalized" },
    ]),
  );
const retained =
  rent.program + rent.programData + rent.config + rent.addressTable;
console.log(
  JSON.stringify(
    {
      scope: "READ_ONLY_PLAN",
      realFundsSpent: false,
      program: deployment.program,
      codeHash: hash,
      codeBytes: code.length,
      maxProgramLen: code.length,
      rentLamports: Object.fromEntries(
        Object.entries(rent).map(([k, n]) => [k, String(n)]),
      ),
      retainedRentLamports: String(retained),
      conservativePeakRentPlusNetworkCushionLamports: String(
        retained + rent.stagingBuffer + 20_000_000n,
      ),
      networkCushionLamports: "20000000",
      networkCushionIsEstimate: true,
      activation: false,
      steps: [
        "Approve a deployment/test spending cap and upgrade authority.",
        "Deploy this exact artifact with max-len equal to codeBytes.",
        "Verify the finalized loader state, authority, slot and exact code hash.",
        "Initialize once using the loader authority.",
        "Create and extend a new lookup table; verify finalized contents.",
        "Update the reviewed public manifest, retaining writes disabled.",
        "Run separately capped public acceptance; enable only after review.",
      ],
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
