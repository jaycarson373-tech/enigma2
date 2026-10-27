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
import { createProtocol, keyBytes, pda, bytes64 } from "./protocol.mjs";
import { lookupAddresses } from "./lookup-addresses.mjs";
import { deployment } from "./enigma-deployment.mjs";

export const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
export const LOOKUP = "AddressLookupTab1e1111111111111111111111111";
export const RELEASE_BYTES = 110784;
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
  const programSeed = "enigma-p-v1-" + deployment.codeHash.slice(0, 16);
  const bufferSeed = "enigma-b-v1-" + deployment.codeHash.slice(0, 16);
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
  const retained = r.program + r.programData + r.config + r.addressTable;
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
  if (label === "Create Enigma address table")
    return { kind: "lookup-create", lookupSlot: journal.lookupSlot };
  if (/^Extend Enigma address table \d+$/.test(label))
    return {
      kind: "lookup-extend",
      offset: Number(label.slice(28)),
      lookupSlot: journal.lookupSlot,
    };
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
  fail(
    /^\d+$/.test(String(stage.lookupSlot)),
    "Invalid saved address-table slot.",
  );
  const signer = createNoopSigner(address(id.wallet));
  const create = await getCreateLookupTableInstructionAsync({
    authority: address(id.wallet),
    payer: signer,
    recentSlot: BigInt(stage.lookupSlot),
  });
  if (stage.kind === "lookup-create") return [create];
  const expected = await lookupAddresses(id.program, id.config, pumpGlobal);
  fail(
    stage.kind === "lookup-extend" &&
      Number.isInteger(stage.offset) &&
      stage.offset >= 0 &&
      stage.offset < expected.length,
    "Invalid address-table stage.",
  );
  return [
    getExtendLookupTableInstruction({
      address: create.accounts[0].address,
      authority: signer,
      payer: signer,
      addresses: expected.slice(stage.offset, stage.offset + 20).map(address),
    }),
  ];
}
// The journal must be persisted by save BEFORE its table transaction is requested.
// execute must simulate, review, cap, persist exact signed wire, then reconcile.
export async function runInitialRelease({
  wallet,
  code,
  rent,
  pumpGlobal,
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
    const status = inspectBuffer(await readAccount(id.buffer), id, code);
    if (!status.exists)
      await execute("Create deployment buffer", bufferSetup(id, code, rent));
    for (const offset of status.missing) {
      // Re-read after a disconnected wallet/unknown outcome; completed chunks are skipped.
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
    "Deployment is awaiting its next finalized slot. Resume this same release.",
  );
  const configAccount = await readAccount(id.config);
  if (!configAccount || configAccount.exists === false)
    await execute("Initialize Enigma", [await client.initializeIx(wallet)]);
  const config = await client.decodeConfig(await readAccount(id.config));
  // decodeConfig already validates the independent v1 suffix.
  fail(
    config.operator === wallet &&
      config.treasury === wallet &&
      config.minDuration === 60 &&
      config.maxDuration === 3600 &&
      config.minCapBps === 10 &&
      config.maxCapBps === 1000,
    "Release configuration does not match Enigma v1.",
  );
  const expected = await lookupAddresses(id.program, id.config, pumpGlobal);
  const signer = createNoopSigner(address(wallet));
  if (!journal.lookupTable) {
    // A completed slot is in SlotHashes; the currently executing slot is not.
    journal.lookupSlot = String(BigInt(await getSlot()) - 1n);
    const create = await getCreateLookupTableInstructionAsync({
      authority: address(wallet),
      payer: signer,
      recentSlot: BigInt(journal.lookupSlot),
    });
    journal.lookupTable = create.accounts[0].address;
    await save(journal);
  }
  let table = await readAccount(journal.lookupTable);
  if (!table || table.exists === false) {
    const create = await getCreateLookupTableInstructionAsync({
      authority: address(wallet),
      payer: signer,
      recentSlot: BigInt(journal.lookupSlot),
    });
    fail(
      create.accounts[0].address === journal.lookupTable,
      "Saved address-table identity mismatch.",
    );
    await execute("Create Enigma address table", [create]);
    table = await readAccount(journal.lookupTable);
  }
  const tableData = inspectLookup(table, wallet, expected, false);
  for (
    let offset = tableData.addresses.length;
    offset < expected.length;
    offset += 20
  ) {
    const current = inspectLookup(
      await readAccount(journal.lookupTable),
      wallet,
      expected,
      false,
    );
    if (current.addresses.length > offset) continue;
    fail(
      current.addresses.length === offset,
      "Address-table recovery needs a fresh inspection.",
    );
    await execute("Extend Enigma address table " + offset, [
      getExtendLookupTableInstruction({
        address: address(journal.lookupTable),
        authority: signer,
        payer: signer,
        addresses: expected.slice(offset, offset + 20).map(address),
      }),
    ]);
  }
  const finalTable = inspectLookup(
    await readAccount(journal.lookupTable),
    wallet,
    expected,
  );
  fail(
    BigInt(await getSlot()) > finalTable.lastExtendedSlot,
    "Address table is warming up. Resume this same release.",
  );
  journal.evidence = {
    ...evidence,
    program: id.program,
    programData: id.programData,
    lookupTable: journal.lookupTable,
    config: id.config,
    checkedAt: new Date().toISOString(),
    publicExecutionAccepted: false,
  };
  await save(journal);
  return journal.evidence;
}
