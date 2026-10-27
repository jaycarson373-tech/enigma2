import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFork, readRpc } from "./harness.mjs";
import { createProtocol, tokenAddress } from "../../lib/protocol.mjs";
import { PROGRAM, PUMP, TOKEN_2022 } from "../fixtures/legacy-constants.mjs";
const { commitIx, launchIx, claimIx } = createProtocol(PROGRAM, {
  independent: false,
});
import { address } from "@solana/kit";
import { Keypair } from "@solana/web3.js";
import legacy from "../../lib/pump-legacy.cjs";

test("pinned mainnet protocol: create, capped deposits, atomic Pump launch, proportional claims", async () => {
  const s = await makeFork();
  s.execute([s.ix], [s.bank], "create pool");
  let book = await s.read();
  assert.equal(book.status, "open");
  assert.equal(book.symbol, "vmOnly");
  const before = s.svm.getBalance(address(s.pub(s.a)));
  s.execute(
    [await commitIx(s.pub(s.a), book, 50000000n)],
    [s.a],
    "first deposit",
  );
  s.execute(
    [await commitIx(s.pub(s.b), book, 50000000n)],
    [s.b],
    "second deposit",
  );
  book = await s.read();
  assert.equal(book.raised, "100000000");
  assert.equal(book.backers, 2);
  s.execute(
    [await commitIx(s.pub(s.a), book, 1000000000n)],
    [s.a],
    "reject wallet cap",
    true,
  );
  assert.equal((await s.read()).raised, "100000000");
  const c = s.svm.getClock();
  c.unixTimestamp = BigInt(book.closesAt);
  s.svm.setClock(c);
  s.execute(
    [await commitIx(s.pub(s.a), book, 1000000n)],
    [s.a],
    "reject late deposit",
    true,
  );
  const mint = Keypair.generate();
  const global = legacy.pump.PUMP_SDK.offlinePumpProgram.coder.accounts.decode(
    "global",
    Buffer.from(
      s.readAccount("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf").data[0],
      "base64",
    ),
  );
  const pGlobal = {
    feeRecipient: global.feeRecipient.toBase58(),
    buybackFeeRecipients: global.buybackFeeRecipients.map((k) => k.toBase58()),
  };
  const ix = await launchIx(
    s.pub(s.bank),
    s.pub(mint),
    book,
    s.config,
    pGlobal,
  );
  await s.loadAccounts(ix.accounts.map((a) => a.address));
  const launched = s.execute(
    [ix],
    [s.bank, mint],
    "atomic create + pooled first buy",
  );
  book = await s.read();
  assert.equal(book.status, "launched");
  assert.equal(book.mint, s.pub(mint));
  assert.ok(BigInt(book.received) > 0n);
  const first = await s.position(s.a),
    second = await s.position(s.b);
  assert.ok(BigInt(first.weight) > BigInt(second.weight));
  const claimA = await claimIx(s.pub(s.a), s.pub(s.a), book);
  s.execute([claimA], [s.a], "claim A");
  s.execute([await claimIx(s.pub(s.b), s.pub(s.b), book)], [s.b], "claim B");
  s.execute([claimA], [s.a], "reject duplicate claim", true);
  console.log(
    JSON.stringify({
      scope: "LOCAL_VM_FORK",
      realFunds: false,
      program: PROGRAM,
      codeHashes: s.codeHashes,
      launched,
      received: book.received,
      padFee: book.padFee,
      leftover: book.leftover,
    }),
  );
});
