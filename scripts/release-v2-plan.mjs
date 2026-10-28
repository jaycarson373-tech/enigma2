// Read-only v2 rent/artifact/upstream review. Never signs, sends or activates.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { enigma2Release as release } from "../lib/enigma2-release.mjs";
import {
  assertArtifact,
  spendPlan,
  releaseIdentity,
} from "../lib/release-v2-flow.mjs";
const read = async (method, params = []) => {
  const r = await fetch(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(25000),
    },
  );
  const b = await r.json();
  if (!r.ok || b.error) throw Error("Read-only release RPC failed");
  return b.result;
};
const code = new Uint8Array(
  readFileSync(new URL("../" + release.artifact, import.meta.url)),
);
await assertArtifact(code);
if (
  (await read("getGenesisHash")) !==
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
)
  throw Error("Wrong network");
const header = (
  await read("getAccountInfo", [
    release.upstream.programData,
    {
      encoding: "base64",
      commitment: "finalized",
      dataSlice: { offset: 0, length: 45 },
    },
  ])
).value;
const b = Buffer.from(header?.data?.[0] || "", "base64");
if (
  header?.owner !== "BPFLoaderUpgradeab1e11111111111111111111111" ||
  b.length !== 45 ||
  b.readUInt32LE(0) !== 3 ||
  String(b.readBigUInt64LE(4)) !== release.upstream.slot ||
  header.space !== 45 + release.upstream.codeBytes
)
  throw Error("Stonk upgraded; execution review is required");
const parts = [];
for (let offset = 45; offset < header.space; offset += 500000) {
  const length = Math.min(500000, header.space - offset);
  const part = (
    await read("getAccountInfo", [
      release.upstream.programData,
      {
        encoding: "base64",
        commitment: "finalized",
        dataSlice: { offset, length },
      },
    ])
  ).value;
  const bytes = Buffer.from(part?.data?.[0] || "", "base64");
  if (
    part?.owner !== header.owner ||
    part.space !== header.space ||
    bytes.length !== length
  )
    throw Error("Incomplete Stonk executable read");
  parts.push(bytes);
}
const after = (
  await read("getAccountInfo", [
    release.upstream.programData,
    {
      encoding: "base64",
      commitment: "finalized",
      dataSlice: { offset: 0, length: 45 },
    },
  ])
).value;
if (
  after?.data?.[0] !== header.data[0] ||
  createHash("sha256").update(Buffer.concat(parts)).digest("hex") !==
    release.upstream.codeHash
)
  throw Error("Stonk code does not match the execution fixture");
const rent = {};
for (const [k, size] of Object.entries({
  program: 36,
  programData: 45 + code.length,
  buffer: 37 + code.length,
  config: 64,
}))
  rent[k] = String(
    await read("getMinimumBalanceForRentExemption", [
      size,
      { commitment: "finalized" },
    ]),
  );
const args = process.argv.slice(2),
  i = args.indexOf("--wallet");
const identity = i >= 0 ? await releaseIdentity(args[i + 1]) : null;
console.log(
  JSON.stringify(
    {
      scope: "READ_ONLY_ENIGMA2_RELEASE_PLAN",
      codeHash: release.codeHash,
      codeBytes: code.length,
      artifactVerified: true,
      upstreamVerified: true,
      upstream: release.upstream,
      identity,
      rentLamports: rent,
      ...spendPlan(rent),
      quoteAsset: "STONK",
      creationBudgetLamports: "20000000",
      creationBudgetSeparateFromDeployment: true,
      lookupTableRequired: false,
      isolatedExecutionPassed: true,
      publicExecutionAccepted: false,
      mainnetReady: false,
      activation: false,
      realFundsSpent: false,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
