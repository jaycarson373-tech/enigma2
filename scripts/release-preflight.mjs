// Read-only. Does not sign, broadcast, request keys or change release flags.
import { assertEnigma2Implemented } from "../lib/enigma2-release.mjs";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { address, getBase58Decoder } from "@solana/kit";
import {
  assertArtifact,
  codeHash,
  releaseIdentity,
  spendPlan,
} from "../lib/release-flow.mjs";
import { deployment } from "../lib/enigma-deployment.mjs";
assertEnigma2Implemented();
const helper = "/Users/Matthew/.codex/bin/solana-rpc.mjs";
async function read(method, params = []) {
  if (existsSync(helper)) {
    const b = JSON.parse(
      execFileSync(process.execPath, [helper, method, JSON.stringify(params)], {
        encoding: "utf8",
        maxBuffer: 20000000,
        timeout: 30000,
      }),
    );
    if (b.error || !("result" in b))
      throw Error("Read-only RPC preflight failed.");
    return b.result;
  }
  const r = await fetch(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(20000),
    },
  );
  const b = await r.json();
  if (!r.ok || b.error) throw Error("Read-only RPC preflight failed.");
  return b.result;
}
const code = new Uint8Array(
  readFileSync(new URL("../releases/v1/enigma.so", import.meta.url)),
);
await assertArtifact(code);
if (
  (await read("getGenesisHash")) !==
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
)
  throw Error("Wrong Solana cluster.");
const pinned = {
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P":
    "7a19affaa2c6187e04a5fe0ea298cee81fa5eb8c24cfcc30d85f615e89f7b02d",
  pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ:
    "4f2955d0f6b40cc9ff7daa18ccad7d19119ba1249759f4e7e3bb691beee6b35e",
  MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e:
    "a87fa9f866272514e6acb852b668c4a08aeb173d56c883039991d114d1199bdb",
};
const upstream = [];
for (const [program, expected] of Object.entries(pinned)) {
  const a = (
    await read("getAccountInfo", [
      program,
      { encoding: "base64", commitment: "finalized" },
    ])
  ).value;
  if (
    !a?.executable ||
    a.owner !== "BPFLoaderUpgradeab1e11111111111111111111111"
  )
    throw Error("Upstream program is unavailable.");
  const p = Buffer.from(a.data[0], "base64");
  if (p.length !== 36 || p.readUInt32LE(0) !== 2)
    throw Error("Unexpected upstream loader state.");
  const programData = getBase58Decoder().decode(p.slice(4));
  const d = (
    await read("getAccountInfo", [
      programData,
      {
        encoding: "base64",
        commitment: "finalized",
        dataSlice: { offset: 0, length: 45 },
      },
    ])
  ).value;
  const b = Buffer.from(d?.data?.[0] || "", "base64");
  if (
    d?.owner !== a.owner ||
    d.executable ||
    b.length < 45 ||
    b.readUInt32LE(0) !== 3
  )
    throw Error("Unexpected upstream program-data identity.");
  if (!Number.isSafeInteger(d.space) || d.space < 45 || d.space > 20000000)
    throw Error("Unexpected upstream executable size.");
  const chunks = [];
  for (let offset = 45; offset < d.space; offset += 1000000) {
    const length = Math.min(1000000, d.space - offset);
    const part = (
      await read("getAccountInfo", [
        programData,
        {
          encoding: "base64",
          commitment: "finalized",
          dataSlice: { offset, length },
        },
      ])
    ).value;
    const bytes = Buffer.from(part?.data?.[0] || "", "base64");
    if (
      part?.owner !== d.owner ||
      part.space !== d.space ||
      bytes.length !== length
    )
      throw Error("Incomplete upstream executable read.");
    chunks.push(bytes);
  }
  const after = (
    await read("getAccountInfo", [
      programData,
      {
        encoding: "base64",
        commitment: "finalized",
        dataSlice: { offset: 0, length: 45 },
      },
    ])
  ).value;
  if (after?.data?.[0] !== d.data[0])
    throw Error(
      "An upstream changed during verification. Retry the read-only preflight.",
    );
  const hash = await codeHash(Buffer.concat(chunks));
  if (hash !== expected)
    throw Error(
      "An upstream program changed. Re-pin and rerun isolated execution before funding.",
    );
  upstream.push({
    program,
    programData,
    codeHash: hash,
    slot: String(b.readBigUInt64LE(4)),
  });
}
const rent = {};
for (const [k, n] of Object.entries({
  program: 36,
  programData: 45 + code.length,
  buffer: 37 + code.length,
  config: 136,
  addressTable: 56 + 32 * 27,
}))
  rent[k] = String(
    await read("getMinimumBalanceForRentExemption", [
      n,
      { commitment: "finalized" },
    ]),
  );
const args = process.argv.slice(2),
  index = args.indexOf("--wallet");
const identity =
  index >= 0 ? await releaseIdentity(String(address(args[index + 1]))) : null;
const balance = identity
  ? (await read("getBalance", [identity.wallet, { commitment: "finalized" }]))
      .value
  : null;
console.log(
  JSON.stringify(
    {
      scope: "READ_ONLY_RELEASE_PREFLIGHT",
      realFundsSpent: false,
      artifactVerified: true,
      codeHash: deployment.codeHash,
      codeBytes: code.length,
      mainnetVerified: true,
      upstream,
      identity,
      balanceLamports: balance === null ? null : String(balance),
      rentLamports: rent,
      ...spendPlan(rent),
      publicExecutionAccepted: false,
      activation: false,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
