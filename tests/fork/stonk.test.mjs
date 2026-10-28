import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { address } from "@solana/kit";
import { stonkFork, pub } from "./stonk-harness.mjs";
import { STONK, TOKEN_2022 } from "../../lib/stonk-protocol.mjs";
test("Enigma 2 executes actual pinned Stonk LaunchLab create/buy and both beneficiary claims in an isolated VM", async () => {
  const h = await stonkFork();
  const { svm, bank, a, b, attacker, client, execute, offering } = h;
  console.log(execute([h.ix], [bank], "file STONK offering"));
  const book = await h.read();
  assert.equal(book.quoteMint, STONK);
  assert.equal(book.isNative, false);
  const beforeA = await h.tokenBalance(STONK, pub(a));
  console.log(
    execute(
      [await client.commitIx(pub(a), book, 50_000_000_000n)],
      [a],
      "deposit A",
    ),
  );
  console.log(
    execute(
      [await client.commitIx(pub(b), book, 50_000_000_000n)],
      [b],
      "deposit B",
    ),
  );
  assert.equal(
    beforeA - (await h.tokenBalance(STONK, pub(a))),
    50_000_000_000n,
  );
  const mint = Keypair.generate();
  execute(
    [await client.launchIx(pub(attacker), pub(mint), await h.read())],
    [attacker, mint],
    "reject early launch",
    true,
  );
  let clock = svm.getClock();
  clock.unixTimestamp += 61n;
  svm.setClock(clock);
  const creatorBefore = svm.getAccount(address(pub(bank))).lamports;
  console.log(
    execute(
      [await client.launchIx(pub(attacker), pub(mint), await h.read())],
      [attacker, mint],
      "atomic Stonk create and pooled buy",
    ),
  );
  const launched = await h.read();
  assert.equal(launched.status, "launched");
  assert.equal(launched.mint, pub(mint));
  assert.ok(BigInt(launched.received) > 0n);
  assert.ok(BigInt(launched.creationCost) <= 20_000_000n);
  const refund = svm.getAccount(address(pub(bank))).lamports - creatorBefore;
  assert.equal(refund, 20_000_000n - BigInt(launched.creationCost));
  console.log(
    execute(
      [await client.claimIx(pub(attacker), pub(a), launched)],
      [attacker],
      "claim to A",
    ),
  );
  console.log(
    execute(
      [await client.claimIx(pub(attacker), pub(b), launched)],
      [attacker],
      "claim to B",
    ),
  );
  const paid =
    (await h.tokenBalance(pub(mint), pub(a), TOKEN_2022)) +
    (await h.tokenBalance(pub(mint), pub(b), TOKEN_2022));
  assert.ok(paid <= BigInt(launched.received));
  assert.ok(BigInt(launched.received) - paid < 2n);
  execute(
    [await client.claimIx(pub(attacker), pub(a), launched)],
    [attacker],
    "reject duplicate claim",
    true,
  );
  execute(
    [await client.launchIx(pub(attacker), pub(mint), launched)],
    [attacker, mint],
    "reject duplicate launch",
    true,
  );
  console.log(
    JSON.stringify({
      receivedRaw: launched.received,
      paidRaw: String(paid),
      creationCostLamports: launched.creationCost,
      remainingStonk: launched.leftover,
      publicTransactions: 0,
    }),
  );
});

test("Enigma 2 rejects invalid terms, source substitutions, cap violations and venue changes with atomic rollback", async () => {
  const h = await stonkFork();
  const { svm, bank, a, b, attacker, client, execute } = h;
  for (const terms of [
    { ...h.terms, duration: 59 },
    { ...h.terms, capBps: 1001 },
    { ...h.terms, raise: "0" },
    { ...h.terms, symbol: "bad!" },
  ]) {
    const p = await client.fileIx(pub(bank), h.config, terms);
    execute([p.ix], [bank], "reject invalid terms", true);
  }
  execute([h.ix], [bank], "file");
  const book = await h.read();
  const deposit = await client.commitIx(pub(a), book, 50_000_000_000n);
  const bad = structuredClone(deposit);
  bad.accounts[4].address = await client.tokenAddress(
    STONK,
    pub(b),
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  );
  execute([bad], [a], "reject substituted STONK source", true);
  execute(
    [await client.commitIx(pub(a), book, 0n)],
    [a],
    "reject zero deposit",
    true,
  );
  execute(
    [await client.commitIx(pub(a), book, 1000_000_000_000n)],
    [a],
    "reject wallet cap",
    true,
  );
  assert.equal((await h.read()).raised, "0");
  execute([deposit], [a], "deposit");
  execute(
    [await client.commitIx(pub(a), await h.read(), 50_000_000_000n)],
    [a],
    "reject cumulative cap",
    true,
  );
  const mint = Keypair.generate();
  let clock = svm.getClock();
  clock.unixTimestamp += 61n;
  svm.setClock(clock);
  execute(
    [await client.commitIx(pub(b), await h.read(), 1n)],
    [b],
    "reject late deposit",
    true,
  );
  const launch = await client.launchIx(
    pub(attacker),
    pub(mint),
    await h.read(),
  );
  for (const index of [6, 7, 8, 9, 11, 12, 13, 14, 15, 17, 20, 22, 23]) {
    const bad = structuredClone(launch);
    bad.accounts[index].address = pub(b);
    execute(
      [bad],
      [attacker, mint],
      "reject substituted launch account " + index,
      true,
    );
  }
  const quoteBefore = await h.tokenBalance(
    STONK,
    await client.vaultAddress(h.offering),
  );
  const global = svm.getAccount(address(launch.accounts[7].address));
  const changed = new Uint8Array(global.data);
  changed[8] ^= 1;
  h.set(launch.accounts[7].address, {
    owner: global.programAddress,
    data: changed,
    lamports: global.lamports,
  });
  execute([launch], [attacker, mint], "reject changed venue snapshot", true);
  assert.equal((await h.read()).status, "open");
  assert.equal(
    await h.tokenBalance(STONK, await client.vaultAddress(h.offering)),
    quoteBefore,
  );
});

test("first STONK deposit and offering creation roll back together when the cap fails", async () => {
  const h = await stonkFork();
  const before = h.svm.getAccount(address(pub(h.bank))).lamports;
  const deposit = await h.client.commitIx(
    pub(h.bank),
    { address: h.offering },
    1000_000_000_000n,
  );
  h.execute(
    [h.ix, deposit],
    [h.bank],
    "reject atomic over-cap first deposit",
    true,
  );
  assert.equal(h.readAccount(h.offering), null);
  assert.ok(before - h.svm.getAccount(address(pub(h.bank))).lamports <= 10000n);
});

test("the app trade builder buys and sells the verified STONK curve with real pinned LaunchLab instructions", async () => {
  const { buildStonkTrade } = await import("../../lib/stonk-trade.mjs");
  const { bytes64 } = await import("../../lib/stonk-protocol.mjs");
  const h = await stonkFork();
  h.execute([h.ix], [h.bank], "file");
  h.execute(
    [await h.client.commitIx(pub(h.a), await h.read(), 50_000_000_000n)],
    [h.a],
    "deposit",
  );
  let clock = h.svm.getClock();
  clock.unixTimestamp += 61n;
  h.svm.setClock(clock);
  const mint = Keypair.generate();
  h.execute(
    [await h.client.launchIx(pub(h.attacker), pub(mint), await h.read())],
    [h.attacker, mint],
    "launch",
  );
  h.execute(
    [await h.client.claimIx(pub(h.a), pub(h.a), await h.read())],
    [h.a],
    "claim",
  );
  const pool = await h.client.curveAddress(pub(mint));
  const fees = {
    protocolFeeRate: "2500",
    platformFeeRate: "10000",
    creatorFeeRate: "0",
  };
  const before = await h.tokenBalance(STONK, pub(h.a));
  const baseBefore = await h.tokenBalance(pub(mint), pub(h.a), TOKEN_2022);
  const buy = await buildStonkTrade(
    {
      wallet: pub(h.a),
      mint: pub(mint),
      offering: h.offering,
      action: "buy",
      amount: "1",
      slippageBps: 100,
    },
    h.readAccount(pool),
    fees,
    100,
  );
  console.log(
    h.execute(
      buy.ixs.map((ix) => ({ ...ix, data: bytes64(ix.data) })),
      [h.a],
      "app STONK buy",
    ),
  );
  assert.equal(
    before - (await h.tokenBalance(STONK, pub(h.a))),
    1_000_000_000n,
  );
  assert.ok(
    (await h.tokenBalance(pub(mint), pub(h.a), TOKEN_2022)) > baseBefore,
  );
  const quoteBeforeSell = await h.tokenBalance(STONK, pub(h.a));
  const sell = await buildStonkTrade(
    {
      wallet: pub(h.a),
      mint: pub(mint),
      offering: h.offering,
      action: "sell",
      amount: "1000",
      slippageBps: 100,
    },
    h.readAccount(pool),
    fees,
    100,
  );
  console.log(
    h.execute(
      sell.ixs.map((ix) => ({ ...ix, data: bytes64(ix.data) })),
      [h.a],
      "app STONK sell",
    ),
  );
  assert.ok((await h.tokenBalance(STONK, pub(h.a))) > quoteBeforeSell);
});

test("wallet signatures, beneficiary accounts and whole-minute window limits are enforced by the v2 executable", async () => {
  for (const duration of [60, 1020, 3600]) {
    const h = await stonkFork();
    const p = await h.client.fileIx(pub(h.bank), h.config, {
      ...h.terms,
      duration,
    });
    h.execute([p.ix], [h.bank], "file duration " + duration);
    assert.equal(
      (await h.read()).closesAt - (await h.read()).createdAt,
      duration,
    );
    const deposit = await h.client.commitIx(
      pub(h.a),
      await h.read(),
      1_000_000_000n,
    );
    const unsigned = structuredClone(deposit);
    unsigned.accounts[0].role = 1;
    h.execute([unsigned], [h.bank], "reject missing backer signature", true);
  }
});
