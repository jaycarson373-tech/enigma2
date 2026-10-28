// Actual loader-v3 deployment in an isolated VM. No network or public broadcasts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import { address, lamports, getTransactionDecoder } from "@solana/kit";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  runInitialRelease,
  releaseIdentity,
  bufferSetup,
  uploadChunk,
  spendPlan,
  RELEASE_BYTES,
  LOADER,
} from "../../lib/release-v2-flow.mjs";

test("Enigma 2 initial release deploys and initializes exact bytecode; restart never pays again", async () => {
  const svm = new LiteSVM(),
    bank = Keypair.generate(),
    wallet = bank.publicKey.toBase58();
  svm.airdrop(address(wallet), lamports(2_000_000_000n));
  // Populate real SlotHashes with normal VM slots for the address-table builtin.
  svm.warpToSlot(100n);
  const recentHash = svm.getSlotHashes()[0];
  const syncSlotHashes = () => {
    recentHash.slot = svm.getClock().slot - 1n;
    recentHash.hash = svm.latestBlockhash();
    svm.setSlotHashes([recentHash]);
  };
  syncSlotHashes();
  const code = new Uint8Array(
    readFileSync(new URL("../../releases/v2/enigma2.so", import.meta.url)),
  );
  const id = await releaseIdentity(wallet),
    rent = Object.fromEntries(
      Object.entries({
        program: 36,
        programData: 45 + RELEASE_BYTES,
        buffer: 37 + RELEASE_BYTES,
        config: 64,
      }).map(([k, v]) => [
        k,
        String(svm.minimumBalanceForRentExemption(BigInt(v))),
      ]),
    );
  const readAccount = async (key) => {
    const a = svm.getAccount(address(key));
    return a.exists
      ? {
          owner: a.programAddress,
          lamports: String(a.lamports),
          executable: a.executable,
          data: [Buffer.from(a.data).toString("base64"), "base64"],
        }
      : null;
  };
  let count = 0,
    maxWire = 0;
  const execute = async (label, ixs) => {
    svm.expireBlockhash();
    const msg = new TransactionMessage({
      payerKey: bank.publicKey,
      recentBlockhash: svm.latestBlockhash(),
      instructions: [
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
      ],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([bank]);
    const wire = tx.serialize();
    assert.ok(wire.length <= 1232, label + " exceeds packet size");
    maxWire = Math.max(maxWire, wire.length);
    const decoded = getTransactionDecoder().decode(wire),
      sim = svm.simulateTransaction(decoded);
    if (sim instanceof FailedTransactionMetadata)
      throw Error(
        label +
          " simulation: " +
          sim.err() +
          "\n" +
          sim.meta().logs().join("\n"),
      );
    const r = svm.sendTransaction(decoded);
    if (r instanceof FailedTransactionMetadata)
      throw Error(label + ": " + r.err() + "\n" + r.meta().logs().join("\n"));
    count++;
    svm.warpToSlot(svm.getClock().slot + 1n);
    syncSlotHashes();
  };
  const journal = {},
    saved = [];
  const params = {
    wallet,
    code,
    rent,
    pumpGlobal: { feeRecipient: wallet, buybackFeeRecipients: [] },
    readAccount,
    getSlot: async () => svm.getClock().slot,
    execute,
    journal,
    save: async (j) => saved.push(JSON.parse(JSON.stringify(j))),
  };
  // Simulate an interrupted upload: restart skips the funded buffer and written chunk.
  await execute("buffer setup", bufferSetup(id, code, rent));
  await execute("first code chunk", [uploadChunk(id, code, 0)]);
  const first = await runInitialRelease(params);
  assert.equal(first.program, id.program);
  assert.equal(first.upgradeAuthority, wallet);
  assert.equal(first.lookupTable, null);
  const paid = count,
    balance = svm.getBalance(address(wallet));
  const second = await runInitialRelease(params);
  assert.equal(second.program, id.program);
  assert.equal(
    count,
    paid,
    "no repeated deployment, config or address-table rent",
  );
  assert.equal(svm.getBalance(address(wallet)), balance);
  assert.equal(
    await readAccount(id.buffer),
    null,
    "loader drains staging buffer",
  );
  assert.ok(await readAccount(id.config));
  await assert.rejects(
    () =>
      runInitialRelease({
        ...params,
        wallet: Keypair.generate().publicKey.toBase58(),
      }),
    /journal belongs/,
  );
  const plan = spendPlan(rent);
  assert.ok(2_000_000_000n - balance < BigInt(plan.conservativeBalance));
  console.log(
    JSON.stringify({
      scope: "ISOLATED_ENIGMA2_LOADER_RELEASE",
      publicTransactions: false,
      transactions: count,
      maxWireBytes: maxWire,
      spentSyntheticLamports: String(2_000_000_000n - balance),
      programOwner: LOADER,
      codeHash: first.codeHash,
    }),
  );
});
