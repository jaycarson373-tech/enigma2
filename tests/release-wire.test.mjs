import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import { getBase64EncodedWireTransaction, address } from "@solana/kit";
import {
  compileReleaseTransaction,
  verifyReleaseWire,
} from "../lib/release-wire.mjs";
import {
  releaseIdentity,
  bufferSetup,
  uploadChunk,
  releaseStage,
  releaseStageInstructions,
  WRITE_BYTES,
} from "../lib/release-flow.mjs";
const wallet = Keypair.generate().publicKey.toBase58(),
  block = {
    blockhash: "11111111111111111111111111111111",
    lastValidBlockHeight: 100n,
  };
const bytes = (tx) =>
  new Uint8Array(Buffer.from(getBase64EncodedWireTransaction(tx), "base64"));
const code = new Uint8Array(
  readFileSync(new URL("../releases/v1/enigma.so", import.meta.url)),
);
const rent = { buffer: "563620920", program: "833120" };
test("release wire requires the exact reviewed wallet, programs, instructions and zero-priority-fee message", async () => {
  const id = await releaseIdentity(wallet),
    ixs = bufferSetup(id, code, rent),
    tx = compileReleaseTransaction(wallet, ixs, block);
  assert.ok(verifyReleaseWire(bytes(tx), wallet, ixs));
  await assert.rejects(
    async () =>
      verifyReleaseWire(
        bytes(tx),
        "So11111111111111111111111111111111111111112",
        ixs,
      ),
    /wallet/,
  );
  const foreign = {
    programAddress: address("11111111111111111111111111111111"),
    accounts: [],
    data: new Uint8Array([2, 0, 0, 0]),
  };
  assert.throws(
    () =>
      verifyReleaseWire(
        bytes(compileReleaseTransaction(wallet, [...ixs, foreign], block)),
        wallet,
        ixs,
      ),
    /differs/,
  );
  const priority = {
    programAddress: address("ComputeBudget111111111111111111111111111111"),
    accounts: [],
    data: new Uint8Array([3, 1, 0, 0, 0, 0, 0, 0, 0]),
  };
  assert.throws(
    () =>
      verifyReleaseWire(
        bytes(compileReleaseTransaction(wallet, [priority, ...ixs], block)),
        wallet,
        ixs,
      ),
    /differs/,
  );
  const changed = ixs.map((i) => ({ ...i, data: i.data.slice() }));
  changed[0].data[changed[0].data.length - 1] ^= 1;
  assert.throws(() => verifyReleaseWire(bytes(tx), wallet, changed), /differs/);
  assert.throws(
    () => verifyReleaseWire(new Uint8Array(1233), wallet, ixs),
    /packet/,
  );
});
test("every upload packet fits and operator labels rebuild only canonical release instructions", async () => {
  const id = await releaseIdentity(wallet),
    global = { feeRecipient: wallet, buybackFeeRecipients: [] };
  let max = 0;
  for (let offset = 0; offset < code.length; offset += WRITE_BYTES) {
    const ixs = [uploadChunk(id, code, offset)],
      tx = compileReleaseTransaction(wallet, ixs, block);
    max = Math.max(max, bytes(tx).length);
    assert.ok(verifyReleaseWire(bytes(tx), wallet, ixs));
  }
  assert.ok(max <= 1232);
  assert.deepEqual(releaseStage("Upload code 850", {}), {
    kind: "write",
    offset: 850,
  });
  assert.deepEqual(
    releaseStage("Extend Enigma address table 20", { lookupSlot: "100" }),
    { kind: "lookup-extend", offset: 20, lookupSlot: "100" },
  );
  for (const label of [
    "Create deployment buffer",
    "Deploy reviewed Enigma program",
    "Initialize Enigma",
    "Create Enigma address table",
    "Extend Enigma address table 0",
  ]) {
    const stage = releaseStage(label, { lookupSlot: "100" }),
      ixs = await releaseStageInstructions(id, code, rent, global, stage);
    assert.ok(
      verifyReleaseWire(
        bytes(compileReleaseTransaction(wallet, ixs, block)),
        wallet,
        ixs,
      ),
    );
  }
  await assert.rejects(
    () =>
      releaseStageInstructions(id, code, rent, global, {
        kind: "write",
        offset: 1,
      }),
    /offset/,
  );
  assert.throws(() => releaseStage("Transfer money", {}), /Unknown/);
});
