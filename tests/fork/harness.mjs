// Real, pinned mainnet program code and account reads, executed ONLY in local SVM.
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import {
  address,
  lamports,
  getTransactionDecoder,
  getBase58Decoder,
} from "@solana/kit";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  PROGRAM,
  PROGRAM_DATA,
  CODE_HASH,
  DEPLOYMENT_SLOT,
  PUMP,
  PUMP_FEE,
  SYSTEM,
  LOOKUP_TABLE,
} from "../fixtures/legacy-constants.mjs";
import { createProtocol, bytes64 } from "../../lib/protocol.mjs";
const {
  decodeConfig,
  configAddress,
  fileIx,
  commitIx,
  launchIx,
  claimIx,
  decodeOffering,
  decodePosition,
  positionAddress,
} = createProtocol(PROGRAM, { independent: false });
import legacy from "../../lib/pump-legacy.cjs";
const cache = pathToFileURL(tmpdir() + "/enigma-fork-cache/");
mkdirSync(cache, { recursive: true });
const pub = (k) => k.publicKey.toBase58();
export async function readRpc(method, params = []) {
  const shared = "/Users/Matthew/.codex/bin/solana-rpc.mjs";
  if (!process.env.SOLANA_RPC_URL && existsSync(shared)) {
    const reply = JSON.parse(
      execFileSync(process.execPath, [shared, method, JSON.stringify(params)], {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      }),
    );
    if (reply.error) throw Error("Shared mainnet read failed");
    return reply.result;
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
  if (b.error) throw Error(JSON.stringify(b.error));
  return b.result;
}
export async function makeFork() {
  if (
    (await readRpc("getGenesisHash")) !==
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
  )
    throw Error("Wrong cluster");
  const svm = new LiteSVM();
  const bank = Keypair.generate(),
    a = Keypair.generate(),
    b = Keypair.generate();
  for (const k of [bank, a, b])
    svm.airdrop(address(pub(k)), lamports(10_000_000_000n));
  const codeHashes = {};
  async function loadProgram(id) {
    const file = new URL(id + ".json", cache);
    let program;
    if (id === PROGRAM)
      program = JSON.parse(
        readFileSync(
          new URL("../fixtures/sequence-program.json", import.meta.url),
          "utf8",
        ),
      );
    else if (existsSync(file)) program = JSON.parse(readFileSync(file, "utf8"));
    else {
      const info = (
        await readRpc("getAccountInfo", [
          id,
          { encoding: "base64", commitment: "finalized" },
        ])
      ).value;
      const d = bytes64(info.data[0]);
      const dataKey = new PublicKey(d.slice(4, 36)).toBase58();
      program = (
        await readRpc("getAccountInfo", [
          dataKey,
          { encoding: "base64", commitment: "finalized" },
        ])
      ).value;
      writeFileSync(file, JSON.stringify(program));
    }
    const d = bytes64(program.data[0]),
      code = d.slice(45),
      hash = createHash("sha256").update(code).digest("hex");
    if (
      id === PROGRAM &&
      (hash !== CODE_HASH ||
        new DataView(d.buffer).getBigUint64(4, true) !== DEPLOYMENT_SLOT)
    )
      throw Error("The reviewed Sequence deployment changed");
    codeHashes[id] = hash;
    svm.addProgram(address(id), code);
  }
  for (const p of [
    PROGRAM,
    PUMP,
    PUMP_FEE,
    "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
  ])
    await loadProgram(p);
  async function loadAccounts(keys) {
    keys = [...new Set(keys)].filter((k) => !svm.getAccount(address(k)).exists);
    for (let offset = 0; offset < keys.length; offset += 50) {
      const batch = keys.slice(offset, offset + 50);
      const r = await readRpc("getMultipleAccounts", [
        batch,
        { encoding: "base64", commitment: "finalized" },
      ]);
      r.value.forEach((a, i) => {
        if (a)
          svm.setAccount({
            address: address(batch[i]),
            data: bytes64(a.data[0]),
            lamports: lamports(BigInt(a.lamports)),
            programAddress: address(a.owner),
            executable: a.executable,
            space: BigInt(a.space),
          });
      });
    }
  }
  const cfgKey = await configAddress();
  await loadAccounts([cfgKey]);
  const cfgAcct = svm.getAccount(address(cfgKey));
  const config = await decodeConfig({
    owner: cfgAcct.programAddress,
    data: [Buffer.from(cfgAcct.data).toString("base64"), "base64"],
  });
  // Historical address-list fixture, reconstructed from finalized extension receipts.
  // The live table was closed with the program. This restores only a LOCAL VM snapshot.
  const lutInfo = JSON.parse(
    readFileSync(
      new URL("../fixtures/lookup-table.json", import.meta.url),
      "utf8",
    ),
  ).account;
  svm.setAccount({
    address: address(LOOKUP_TABLE),
    data: bytes64(lutInfo.data[0]),
    lamports: lamports(BigInt(lutInfo.lamports)),
    programAddress: address(lutInfo.owner),
    executable: false,
    space: BigInt(lutInfo.space),
  });
  // Only LOCAL VM time: make every historical LUT extension usable. No live
  // getSlot request is needed (the shared read proxy intentionally excludes it).
  const lutBytes = bytes64(lutInfo.data[0]);
  svm.warpToSlot(
    new DataView(
      lutBytes.buffer,
      lutBytes.byteOffset,
      lutBytes.byteLength,
    ).getBigUint64(12, true) + 1n,
  );
  const lut = new AddressLookupTableAccount({
    key: new PublicKey(LOOKUP_TABLE),
    state: AddressLookupTableAccount.deserialize(
      Buffer.from(lutInfo.data[0], "base64"),
    ),
  });
  const clock = svm.getClock();
  clock.unixTimestamp = BigInt(Math.floor(Date.now() / 1000));
  svm.setClock(clock);
  const terms = {
    name: "ENIGMA LOCAL FORK",
    symbol: "vmOnly",
    uri: "https://example.com/local-vm-not-a-real-coin.json",
    duration: 60,
    capBps: 50,
    creatorFeeBps: 0,
  };
  const { offering, ix } = await fileIx(pub(bank), config, terms);
  await loadAccounts(ix.accounts.map((a) => a.address));
  function execute(ixs, signers, label, mustFail = false) {
    svm.expireBlockhash();
    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
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
    }).compileToV0Message([lut]);
    const tx = new VersionedTransaction(message);
    tx.sign(signers);
    const wire = tx.serialize();
    if (wire.length > 1232)
      throw Error("Transaction too large: " + wire.length);
    const result = svm.sendTransaction(getTransactionDecoder().decode(wire));
    const failed = result instanceof FailedTransactionMetadata;
    if (mustFail) {
      if (!failed) throw Error("Unexpectedly succeeded: " + label);
      return result;
    }
    if (failed)
      throw Error(
        label + ": " + result.err() + "\n" + result.meta().logs().join("\n"),
      );
    return {
      signature: getBase58Decoder().decode(result.signature()),
      compute: Number(result.computeUnitsConsumed()),
      wireBytes: wire.length,
    };
  }
  const readAccount = (k) => {
    const a = svm.getAccount(address(k));
    return a.exists
      ? {
          owner: a.programAddress,
          data: [Buffer.from(a.data).toString("base64"), "base64"],
        }
      : null;
  };
  const read = () => decodeOffering(readAccount(offering), offering);
  async function position(wallet) {
    const k = await positionAddress(offering, pub(wallet));
    const a = readAccount(k);
    return a ? decodePosition(a, offering, pub(wallet)) : null;
  }
  return {
    svm,
    bank,
    a,
    b,
    config,
    offering,
    terms,
    ix,
    execute,
    read,
    position,
    loadAccounts,
    pub,
    codeHashes,
    readAccount,
  };
}
