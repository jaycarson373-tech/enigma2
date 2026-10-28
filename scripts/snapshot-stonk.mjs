// Read-only fixture capture. Never signs, broadcasts or changes a deployment manifest.
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { enigma2Release as target } from "../lib/enigma2-release.mjs";
import { verifyStonkVenue } from "../lib/stonk-readiness.mjs";
const rpc = async (method, params = []) => {
  const r = await fetch(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const b = await r.json();
  if (!r.ok || b.error) throw Error("Public fixture RPC failed");
  return b.result;
};
const response = await fetch(
  "https://www.stonkfun.xyz/api/public/v1/launchlab/pricing?quoteMint=" +
    target.quoteMint,
  { signal: AbortSignal.timeout(20000) },
);
const { data: p } = await response.json();
const venue = await verifyStonkVenue(p, rpc);
const keys = [
  target.launchlabProgram,
  p.curve.configId,
  target.platform,
  target.quoteMint,
  p.allowConfig.standard,
  p.curveRule.standard,
];
const accounts = await rpc("getMultipleAccounts", [
  keys,
  { encoding: "base64", commitment: "finalized" },
]);
const read = async (offset, length) =>
  (
    await rpc("getAccountInfo", [
      venue.programData,
      {
        encoding: "base64",
        commitment: "finalized",
        dataSlice: { offset, length },
      },
    ])
  ).value;
const header = await read(0, 45);
const head = Buffer.from(header?.data?.[0] || "", "base64");
if (
  header?.owner !== "BPFLoaderUpgradeab1e11111111111111111111111" ||
  head.length !== 45 ||
  head.readUInt32LE(0) !== 3 ||
  !Number.isSafeInteger(header.space) ||
  header.space > 20_000_000
)
  throw Error("Invalid upstream executable header");
const chunks = [];
for (let offset = 45; offset < header.space; offset += 500000) {
  const length = Math.min(500000, header.space - offset);
  const part = await read(offset, length);
  const b = Buffer.from(part?.data?.[0] || "", "base64");
  if (
    part.owner !== header.owner ||
    part.space !== header.space ||
    b.length !== length
  )
    throw Error("Incomplete program slice");
  chunks.push(b);
}
if ((await read(0, 45)).data[0] !== header.data[0])
  throw Error("LaunchLab upgraded during snapshot");
const binary = Buffer.concat(chunks);
const codeHash = createHash("sha256").update(binary).digest("hex");
const pricing = Object.fromEntries(
  [
    "quote",
    "raise",
    "curve",
    "platform",
    "allowConfig",
    "curveRule",
    "prices",
    "modes",
  ].map((k) => [k, p[k]]),
);
await mkdir(new URL("../fixtures/stonk/", import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL("../fixtures/stonk/launchlab.so.gz", import.meta.url),
  gzipSync(binary),
);
await writeFile(
  new URL("../fixtures/stonk/execution-snapshot.json", import.meta.url),
  JSON.stringify(
    {
      scope: "PUBLIC_READ_ONLY_VM_FIXTURE",
      checkedAt: new Date().toISOString(),
      pricing,
      keys,
      accounts,
      program: target.launchlabProgram,
      programData: venue.programData,
      codeHash,
      codeBytes: binary.length,
      deploymentSlot: String(head.readBigUInt64LE(4)),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    codeHash,
    codeBytes: binary.length,
    deploymentSlot: String(head.readBigUInt64LE(4)),
    fixtureSlot: accounts.context.slot,
    signed: false,
    submitted: false,
  }),
);
