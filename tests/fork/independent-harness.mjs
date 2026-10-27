// All transactions in this module execute ONLY in LiteSVM with synthetic funds.
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import { address, lamports, getTransactionDecoder } from "@solana/kit";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createProtocol, bytes64, keyBytes } from "../../lib/protocol.mjs";
import { PUMP, PUMP_FEE, PUMP_GLOBAL, SYSTEM } from "../../lib/constants.mjs";
import legacy from "../../lib/pump-legacy.cjs";
import { lookupAddresses } from "../../lib/lookup-addresses.mjs";
import { deployment } from "../../lib/enigma-deployment.mjs";
import { gunzipSync } from "node:zlib";
const LOCAL_ID = "AicdhDHzPx3tyrMarZ77SaDVrixLvNohB9eYaAGdHJFg";
const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
export const pub = (k) => k.publicKey.toBase58();
const fixture = JSON.parse(
  readFileSync(
    new URL("../../fixtures/upstream/accounts.json", import.meta.url),
  ),
);
export async function independentFork() {
  const svm = new LiteSVM(),
    bank = Keypair.generate(),
    a = Keypair.generate(),
    b = Keypair.generate(),
    attacker = Keypair.generate();
  for (const k of [bank, a, b, attacker])
    svm.airdrop(address(pub(k)), lamports(10_000_000_000n));
  const client = createProtocol(LOCAL_ID),
    hashes = {};
  const set = (key, v) =>
    svm.setAccount({
      address: address(key),
      programAddress: address(v.owner),
      data: bytes64(v.data[0]),
      lamports: lamports(BigInt(v.lamports)),
      executable: v.executable,
      space: BigInt(v.space ?? bytes64(v.data[0]).length),
    });
  for (const id of [
    PUMP,
    PUMP_FEE,
    "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
  ]) {
    const v = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL(`../../fixtures/upstream/${id}.json.gz`, import.meta.url),
        ),
      ),
    );
    const code = bytes64(v.data[0]).slice(45);
    hashes[id] = createHash("sha256").update(code).digest("hex");
    const expected = {
      [PUMP]:
        "7a19affaa2c6187e04a5fe0ea298cee81fa5eb8c24cfcc30d85f615e89f7b02d",
      [PUMP_FEE]:
        "4f2955d0f6b40cc9ff7daa18ccad7d19119ba1249759f4e7e3bb691beee6b35e",
      MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e:
        "a87fa9f866272514e6acb852b668c4a08aeb173d56c883039991d114d1199bdb",
    };
    if (hashes[id] !== expected[id]) throw Error("Upstream fixture changed");
    svm.addProgram(address(id), code);
  }
  const code = readFileSync(
    new URL("../../target/deploy/enigma.so", import.meta.url),
  );
  hashes[LOCAL_ID] = createHash("sha256").update(code).digest("hex");
  if (hashes[LOCAL_ID] !== deployment.codeHash)
    throw Error("Compiled Enigma does not match the reviewed manifest");
  svm.addProgram(address(LOCAL_ID), code);
  const dataKey = PublicKey.findProgramAddressSync(
    [new PublicKey(LOCAL_ID).toBuffer()],
    new PublicKey(LOADER),
  )[0].toBase58();
  const programData = Buffer.alloc(45 + code.length);
  programData.writeUInt32LE(3);
  programData.writeBigUInt64LE(1n, 4);
  programData[12] = 1;
  programData.set(bank.publicKey.toBytes(), 13);
  programData.set(code, 45);
  set(dataKey, {
    owner: LOADER,
    executable: false,
    lamports: 10_000_000,
    data: [programData.toString("base64")],
    space: programData.length,
  });
  const program = Buffer.concat([
    Buffer.from([2, 0, 0, 0]),
    Buffer.from(keyBytes(dataKey)),
  ]);
  set(LOCAL_ID, {
    owner: LOADER,
    executable: true,
    lamports: 1_000_000,
    data: [program.toString("base64")],
    space: 36,
  });
  async function load(keys) {
    keys = [...new Set(keys)].filter((k) => !svm.getAccount(address(k)).exists);
    if (!keys.length) return;
    for (const k of keys) if (fixture.accounts[k]) set(k, fixture.accounts[k]);
  }
  await load([PUMP_GLOBAL]);
  const rawGlobal = svm.getAccount(address(PUMP_GLOBAL));
  const global = legacy.pump.PUMP_SDK.offlinePumpProgram.coder.accounts.decode(
    "global",
    Buffer.from(rawGlobal.data),
  );
  const pumpGlobal = {
    feeRecipient: global.feeRecipient.toBase58(),
    buybackFeeRecipients: global.buybackFeeRecipients.map((k) => k.toBase58()),
  };
  let clock = svm.getClock();
  clock.unixTimestamp = 1792785600n;
  svm.setClock(clock);
  // Isolated synthetic LUT. This is NOT the closed Sequence table and is never broadcast.
  const lutKey = pub(Keypair.generate());
  let lut;
  const staticKeys = await lookupAddresses(
    LOCAL_ID,
    await client.configAddress(),
    pumpGlobal,
  );
  function tableFor(ixs) {
    const keys = staticKeys;
    const data = Buffer.alloc(56 + keys.length * 32);
    data.writeUInt32LE(1);
    data.writeBigUInt64LE(18446744073709551615n, 4);
    keys.forEach((k, i) => data.set(keyBytes(k), 56 + i * 32));
    set(lutKey, {
      owner: "AddressLookupTab1e1111111111111111111111111",
      executable: false,
      lamports: 10_000_000,
      data: [data.toString("base64")],
      space: data.length,
    });
    lut = new AddressLookupTableAccount({
      key: new PublicKey(lutKey),
      state: AddressLookupTableAccount.deserialize(data),
    });
    return lut;
  }
  function execute(ixs, signers, label, mustFail = false) {
    svm.expireBlockhash();
    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ...ixs.map(
        (i) =>
          new TransactionInstruction({
            programId: new PublicKey(i.programAddress),
            keys: i.accounts.map((a) => ({
              pubkey: new PublicKey(a.address),
              isSigner: !!(a.role & 2),
              isWritable: !!(a.role & 1),
            })),
            data: Buffer.from(i.data),
          }),
      ),
    ];
    const message = new TransactionMessage({
      payerKey: signers[0].publicKey,
      recentBlockhash: svm.latestBlockhash(),
      instructions,
    }).compileToV0Message([tableFor(ixs)]);
    const tx = new VersionedTransaction(message);
    tx.sign(signers);
    const wire = tx.serialize();
    if (wire.length > 1232)
      throw Error(`${label}: ${wire.length} bytes exceeds packet`);
    const result = svm.sendTransaction(getTransactionDecoder().decode(wire));
    const failed = result instanceof FailedTransactionMetadata;
    if (mustFail) {
      if (!failed) throw Error("Unexpected success: " + label);
      return result;
    }
    if (failed)
      throw Error(
        label + ": " + result.err() + "\n" + result.meta().logs().join("\n"),
      );
    return {
      label,
      wireBytes: wire.length,
      compute: Number(result.computeUnitsConsumed()),
    };
  }
  const readAccount = (k) => {
    let v = svm.getAccount(address(k));
    return v.exists
      ? {
          owner: v.programAddress,
          data: [Buffer.from(v.data).toString("base64"), "base64"],
        }
      : null;
  };
  const init = await client.initializeIx(pub(bank));
  execute(
    [await client.initializeIx(pub(attacker))],
    [attacker],
    "reject initialization takeover",
    true,
  );
  execute([init], [bank], "initialize");
  const config = await client.decodeConfig(
    readAccount(await client.configAddress()),
  );
  const terms = {
    name: "ENIGMA ISOLATED TEST",
    symbol: "enigmaVm",
    uri: "https://example.com/local-test-only.json",
    duration: 60,
    capBps: 50,
    creatorFeeBps: 0,
  };
  const { offering, ix } = await client.fileIx(pub(bank), config, terms);
  await load(ix.accounts.map((a) => a.address));
  return {
    svm,
    bank,
    a,
    b,
    attacker,
    client,
    pub,
    execute,
    load,
    readAccount,
    config,
    terms,
    offering,
    ix,
    pumpGlobal,
    hashes,
    read: () => client.decodeOffering(readAccount(offering), offering),
    position: async (k) =>
      client.decodePosition(
        readAccount(await client.positionAddress(offering, pub(k))),
        offering,
        pub(k),
      ),
  };
}
