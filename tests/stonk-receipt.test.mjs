import { test } from "node:test";
import assert from "node:assert/strict";
import { getBase58Decoder } from "@solana/kit";
import { verifyLaunchReceipt } from "../lib/stonk-receipt.mjs";
import { verifyAcceptance } from "../lib/stonk-acceptance.mjs";
import {
  V2_PROGRAM,
  LAUNCHLAB,
  PLATFORM,
  STONK,
  discriminator,
  SYSTEM,
} from "../lib/stonk-protocol.mjs";
const data = async (name) =>
  getBase58Decoder().decode(await discriminator("global:" + name));
test("v2 receipts require the Enigma launch and matching atomic standard Stonk creation and buy", async () => {
  const book = {
    version: 2,
    status: "launched",
    mint: STONK,
    address: SYSTEM,
    raised: "1",
  };
  const create = {
    programId: LAUNCHLAB,
    accounts: [book.mint, PLATFORM, STONK],
    data: await data("initialize_with_token2022"),
  };
  const buy = { ...create, data: await data("buy_exact_in") };
  const top = {
    programId: V2_PROGRAM,
    accounts: [SYSTEM, book.mint, book.address],
    data: await data("launch"),
  };
  const tx = {
    meta: {
      err: null,
      innerInstructions: [{ index: 0, instructions: [create, buy] }],
    },
    transaction: { message: { instructions: [top] } },
  };
  assert.equal(await verifyLaunchReceipt(tx, book), true);
  for (const bad of [
    { ...tx, meta: { ...tx.meta, err: "failure" } },
    {
      ...tx,
      meta: {
        ...tx.meta,
        innerInstructions: [{ index: 0, instructions: [create] }],
      },
    },
    {
      ...tx,
      meta: {
        ...tx.meta,
        innerInstructions: [
          {
            index: 0,
            instructions: [
              {
                ...create,
                programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
              },
              buy,
            ],
          },
        ],
      },
    },
  ])
    assert.equal(await verifyLaunchReceipt(bad, book), false);
  assert.equal(await verifyLaunchReceipt(tx, { ...book, version: 1 }), false);
  assert.equal(await verifyLaunchReceipt(tx, { ...book, mint: SYSTEM }), false);
});
test("an acceptance flag cannot substitute for finalized launch/claim evidence", async () => {
  const read = async () => {
    throw Error(
      "Receipt reads must not begin without a complete review descriptor",
    );
  };
  await assert.rejects(
    () => verifyAcceptance(read, { executionAccepted: true, acceptance: null }),
    /missing/,
  );
  await assert.rejects(
    () =>
      verifyAcceptance(read, {
        acceptance: {
          offering: SYSTEM,
          mint: STONK,
          creator: SYSTEM,
          launchSignature: "same",
          claims: [
            { signature: "same", beneficiary: "one" },
            { signature: "other", beneficiary: "two" },
          ],
        },
      }),
    /duplicated/,
  );
});
