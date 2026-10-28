// Initial deployment only. No key files, signing, broadcasts, upgrades or closure.
// The caller supplies a reviewed wallet transport. Public journals contain no keys.
import { address, createNoopSigner, getBase58Decoder } from "@solana/kit";
import { getCreateAccountWithSeedInstruction } from "@solana-program/system";
import {
  getInitializeBufferInstruction,
  getWriteInstruction,
  getDeployWithMaxDataLenInstruction,
} from "@solana-program/loader-v3";
import {
  getCreateLookupTableInstructionAsync,
  getExtendLookupTableInstruction,
  getAddressLookupTableDecoder,
} from "@solana-program/address-lookup-table";
import {
  createStonkProtocol as createProtocol,
  keyBytes,
  pda,
  bytes64,
} from "./stonk-protocol.mjs";

import { enigma2Release as deployment } from "./enigma2-release.mjs";

export const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
export const LOOKUP = "AddressLookupTab1e1111111111111111111111111";
export const RELEASE_BYTES = deployment.codeBytes;
export const WRITE_BYTES = 850;
export const NETWORK_ALLOWANCE = 20000000n;
const fail = (ok, text) => {
  if (!ok) throw Error(text);
};
export async function codeHash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function assertArtifact(code) {
  fail(
    code.length === RELEASE_BYTES &&
      (await codeHash(code)) === deployment.codeHash,
    "The deployment artifact does not match the reviewed release.",
  );
}
async function withSeed(wallet, seed) {
  const b = new Uint8Array(64 + seed.length);
  b.set(keyBytes(wallet));
  b.set(new TextEncoder().encode(seed), 32);
  b.set(keyBytes(LOADER), 32 + seed.length);
  return address(
    getBase58Decoder().decode(
      new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
    ),
  );
}
export async function releaseIdentity(wallet) {
  wallet = String(address(wallet));
  const programSeed = "enigma-p-v2-" + deployment.codeHash.slice(0, 16);
  const bufferSeed = "enigma-b-v2-" + deployment.codeHash.slice(0, 16);
  const program = await withSeed(wallet, programSeed),
    buffer = await withSeed(wallet, bufferSeed);
  const client = createProtocol(program);
  return {
    wallet,
    program,
    buffer,
    programSeed,
    bufferSeed,
    programData: await pda(LOADER, keyBytes(program)),
    config: await client.configAddress(),
  };
}
const data = (a) =>
  a?.data instanceof Uint8Array
    ? a.data
    : a?.data?.[0]
      ? bytes64(a.data[0])
      : new Uint8Array();
const owner = (a) => a?.owner || a?.programAddress;
export function inspectBuffer(account, identity, code) {
  if (!account || account.exists === false)
    return {
      exists: false,
      missing: Array.from(
        { length: Math.ceil(code.length / WRITE_BYTES) },
        (_, i) => i * WRITE_BYTES,
      ),
    };
  const b = data(account),
    v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  fail(
    owner(account) === LOADER &&
      !account.executable &&
      b.length === 37 + code.length,
    "Deployment buffer identity or size mismatch.",
  );
  fail(
    v.getUint32(0, true) === 1 &&
      b[4] === 1 &&
      getBase58Decoder().decode(b.slice(5, 37)) === identity.wallet,
    "Deployment buffer authority mismatch.",
  );
  const missing = [];
  for (let at = 0; at < code.length; at += WRITE_BYTES)
    if (!code.slice(at, at + WRITE_BYTES).every((x, i) => b[37 + at + i] === x))
      missing.push(at);
  return { exists: true, missing };
}
export async function inspectProgram(
  programAccount,
  dataAccount,
  identity,
  code,
) {
  const p = data(programAccount),
    d = data(dataAccount);
  fail(
    owner(programAccount) === LOADER &&
      programAccount.executable &&
      p.length === 36 &&
      new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(0, true) ===
        2 &&
      getBase58Decoder().decode(p.slice(4)) === identity.programData,
    "Deployed program identity mismatch.",
  );
  fail(
    owner(dataAccount) === LOADER &&
      !dataAccount.executable &&
      d.length === 45 + code.length,
    "Deployed program-data identity or size mismatch.",
  );
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  fail(
    v.getUint32(0, true) === 3 &&
      d[12] === 1 &&
      getBase58Decoder().decode(d.slice(13, 45)) === identity.wallet,
    "Deployed upgrade authority does not match the funding wallet.",
  );
  fail(
    (await codeHash(d.slice(45))) === deployment.codeHash,
    "Deployed bytecode differs from the reviewed artifact.",
  );
  return {
    slot: String(v.getBigUint64(4, true)),
    codeHash: deployment.codeHash,
    upgradeAuthority: identity.wallet,
  };
}
export function inspectLookup(account, wallet, expected, exact = true) {
  fail(
    account && owner(account) === LOOKUP && !account.executable,
    "Release address-table owner mismatch.",
  );
  const d = getAddressLookupTableDecoder().decode(data(account));
  fail(
    d.deactivationSlot === 18446744073709551615n &&
      d.authority.__option === "Some" &&
      d.authority.value === wallet,
    "Release address-table authority or activity mismatch.",
  );
  fail(
    d.addresses.length <= expected.length &&
      d.addresses.every((a, i) => a === expected[i]) &&
      (!exact || d.addresses.length === expected.length),
    "Release address-table contents do not match.",
  );
  return d;
}
export function spendPlan(rent) {
  const r = Object.fromEntries(
    Object.entries(rent).map(([k, v]) => [k, BigInt(v)]),
  );
  const retained = r.program + r.programData + r.config;
  return {
    retained: String(retained),
    temporaryBuffer: String(r.buffer),
    networkAllowance: String(NETWORK_ALLOWANCE),
    conservativeBalance: String(retained + r.buffer + NETWORK_ALLOWANCE),
    notReclaimableByCurrentCode: String(r.program + r.config),
  };
}
function seededAccount(identity, which, amount, size) {
  return getCreateAccountWithSeedInstruction({
    payer: createNoopSigner(address(identity.wallet)),
    newAccount: identity[which],
    base: address(identity.wallet),
    seed: identity[which + "Seed"],
    amount: BigInt(amount),
    space: BigInt(size),
    programAddress: address(LOADER),
  });
}
export function bufferSetup(identity, code, rent) {
  return [
    seededAccount(identity, "buffer", rent.buffer, 37 + code.length),
    getInitializeBufferInstruction({
      sourceAccount: identity.buffer,
      bufferAuthority: address(identity.wallet),
    }),
  ];
}
export function uploadChunk(identity, code, offset) {
  fail(
    Number.isInteger(offset) &&
      offset >= 0 &&
      offset < code.length &&
      offset % WRITE_BYTES === 0,
    "Invalid deployment write offset.",
  );
  return getWriteInstruction({
    bufferAccount: identity.buffer,
    bufferAuthority: createNoopSigner(address(identity.wallet)),
    offset,
    bytes: code.slice(offset, offset + WRITE_BYTES),
  });
}
export function deployInstructions(identity, code, rent) {
  const signer = createNoopSigner(address(identity.wallet));
  return [
    seededAccount(identity, "program", rent.program, 36),
    getDeployWithMaxDataLenInstruction({
      payerAccount: signer,
      programDataAccount: identity.programData,
      programAccount: identity.program,
      bufferAccount: identity.buffer,
      authority: signer,
      maxDataLen: BigInt(code.length),
    }),
  ];
}

export function releaseStage(label, journal) {
  if (label === "Create deployment buffer") return { kind: "buffer" };
  if (/^Upload code \d+$/.test(label))
    return { kind: "write", offset: Number(label.slice(12)) };
  if (label === "Deploy reviewed Enigma program") return { kind: "deploy" };
  if (label === "Initialize Enigma") return { kind: "initialize" };
  throw Error("Unknown release stage.");
}
export async function releaseStageInstructions(
  id,
  code,
  rent,
  pumpGlobal,
  stage,
) {
  if (stage.kind === "buffer") return bufferSetup(id, code, rent);
  if (stage.kind === "write") return [uploadChunk(id, code, stage.offset)];
  if (stage.kind === "deploy") return deployInstructions(id, code, rent);
  if (stage.kind === "initialize")
    return [await createProtocol(id.program).initializeIx(id.wallet)];
  throw Error("Unknown Enigma 2 release stage.");
}
// Initial wallet-controlled release, resumable against exact artifact/account effects.
export async function runInitialRelease({
  wallet,
  code,
  rent,
  readAccount,
  getSlot,
  execute,
  journal,
  save,
}) {
  await assertArtifact(code);
  const id = await releaseIdentity(wallet),
    client = createProtocol(id.program);
  const scope = id.wallet + ":" + id.program + ":" + deployment.codeHash;
  fail(
    !journal.scope || journal.scope === scope,
    "This release journal belongs to another wallet or artifact.",
  );
  journal.scope = scope;
  journal.identity = id;
  await save(journal);
  let program = await readAccount(id.program);
  if (!program || program.exists === false) {
    let status = inspectBuffer(await readAccount(id.buffer), id, code);
    if (!status.exists)
      await execute("Create deployment buffer", bufferSetup(id, code, rent));
    for (const offset of status.missing) {
      const current = inspectBuffer(await readAccount(id.buffer), id, code);
      if (current.missing.includes(offset))
        await execute("Upload code " + offset, [uploadChunk(id, code, offset)]);
    }
    fail(
      inspectBuffer(await readAccount(id.buffer), id, code).missing.length ===
        0,
      "Deployment upload is incomplete.",
    );
    await execute(
      "Deploy reviewed Enigma program",
      deployInstructions(id, code, rent),
    );
    program = await readAccount(id.program);
  }
  const evidence = await inspectProgram(
    program,
    await readAccount(id.programData),
    id,
    code,
  );
  fail(
    BigInt(await getSlot()) > BigInt(evidence.slot),
    "Deployment is awaiting the next finalized slot. Resume this same release.",
  );
  const account = await readAccount(id.config);
  if (!account || account.exists === false)
    await execute("Initialize Enigma", [await client.initializeIx(wallet)]);
  const config = await client.decodeConfig(await readAccount(id.config));
  fail(
    config.version === 2 && config.operator === wallet,
    "Release config does not match Enigma 2.",
  );
  journal.complete = true;
  journal.evidence = {
    ...evidence,
    program: id.program,
    programData: id.programData,
    config: id.config,
    upgradeAuthority: wallet,
    lookupTable: null,
  };
  await save(journal);
  return journal.evidence;
}
