import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { address } from "@solana/kit";
import { independentFork, pub } from "./independent-harness.mjs";
import { entitlement } from "../../lib/amounts.mjs";
const clone = (ix) => ({
  ...ix,
  accounts: ix.accounts.map((a) => ({ ...a })),
  data: ix.data.slice(),
});
test("independent Enigma: initialize, cap, atomic Pump launch, claims and hostile account rejection", async () => {
  const s = await independentFork(),
    c = s.client,
    report = [];
  s.execute(
    [await c.initializeIx(pub(s.attacker))],
    [s.attacker],
    "reject config reinitialization",
    true,
  );
  const tooShort = await c.fileIx(pub(s.bank), s.config, {
    ...s.terms,
    duration: 59,
  });
  s.execute([tooShort.ix], [s.bank], "reject short duration", true);
  const tooLong = await c.fileIx(pub(s.bank), s.config, {
    ...s.terms,
    duration: 3601,
  });
  s.execute([tooLong.ix], [s.bank], "reject long duration", true);
  report.push(s.execute([s.ix], [s.bank], "file 1-minute window"));
  let book = await s.read();
  assert.equal(book.version, 1);
  assert.equal(book.feeBps, 0);
  assert.equal(book.padFee, "0");
  const zero = await c.commitIx(pub(s.a), book, 0n);
  s.execute([zero], [s.a], "reject zero deposit", true);
  const missing = await c.commitIx(pub(s.a), book, 1_000_000n);
  missing.accounts[0].role = 1;
  s.execute([missing], [s.attacker], "reject missing backer signature", true);
  const deposits = [];
  for (const k of [s.a, s.b]) {
    const ix = await c.commitIx(pub(k), book, 50_000_000n);
    deposits.push(ix);
    report.push(s.execute([ix], [k], "deposit"));
  }
  book = await s.read();
  assert.equal(book.raised, "100000000");
  assert.equal(book.backers, 2);
  const bad = clone(deposits[0]);
  bad.accounts[2].address = pub(s.attacker);
  s.execute([bad], [s.a], "reject substituted position", true);
  const wrongVault = clone(deposits[0]);
  wrongVault.accounts[3].address = pub(s.attacker);
  s.execute([wrongVault], [s.a], "reject substituted vault", true);
  s.execute(
    [await c.commitIx(pub(s.a), book, 1_000_000_000n)],
    [s.a],
    "reject cap",
    true,
  );
  assert.equal((await s.read()).raised, "100000000");
  const mint = Keypair.generate(),
    launch = await c.launchIx(
      pub(s.attacker),
      pub(mint),
      book,
      s.config,
      s.pumpGlobal,
    );
  await s.load(launch.accounts.map((a) => a.address));
  s.execute([launch], [s.attacker, mint], "reject early finalize", true);
  let clock = s.svm.getClock();
  clock.unixTimestamp = BigInt(book.closesAt);
  s.svm.setClock(clock);
  s.execute([deposits[0]], [s.a], "reject late deposit", true);
  const redirected = clone(launch);
  redirected.accounts[39].address = pub(s.attacker);
  s.execute(
    [redirected],
    [s.attacker, mint],
    "reject budget refund theft",
    true,
  );
  const creatorBefore = s.svm.getBalance(address(pub(s.bank)));
  const finalizerBefore = s.svm.getBalance(address(pub(s.attacker)));
  report.push(
    s.execute(
      [launch],
      [s.attacker, mint],
      "atomic create plus pooled first buy",
    ),
  );
  const finalizerAfter = s.svm.getBalance(address(pub(s.attacker)));
  assert.equal(
    finalizerBefore - finalizerAfter,
    10_000n,
    "only finalizer network fee remains after observed rent reimbursement",
  );
  book = await s.read();
  assert.equal(book.status, "launched");
  assert.equal(book.mint, pub(mint));
  assert.ok(BigInt(book.received) > 0n);
  assert.ok(BigInt(book.received) <= BigInt(book.totalWeight));
  assert.ok(BigInt(book.creationCost) <= 20_000_000n);
  assert.equal(
    s.svm.getBalance(address(pub(s.bank))) - creatorBefore,
    20_000_000n - BigInt(book.creationCost),
  );
  s.execute([launch], [s.attacker, mint], "reject repeated finalization", true);
  const vault = await c.vaultAddress(s.offering),
    ata = await c.tokenAddress(book.mint, vault);
  const balance = (k) =>
    Buffer.from(s.svm.getAccount(address(k)).data).readBigUInt64LE(64);
  const initial = balance(ata);
  let paid = 0n;
  for (const k of [s.a, s.b]) {
    const position = await s.position(k),
      expected = entitlement(book, position),
      ix = await c.claimIx(pub(s.attacker), pub(k), book);
    const redirected = clone(ix);
    redirected.accounts[1].address = pub(s.attacker);
    s.execute([redirected], [s.attacker], "reject beneficiary theft", true);
    const badAta = clone(ix);
    badAta.accounts[7].address = pub(s.attacker);
    s.execute([badAta], [s.attacker], "reject token destination theft", true);
    report.push(
      s.execute([ix], [s.attacker], "permissionless claim to recorded backer"),
    );
    const dest = await c.tokenAddress(book.mint, pub(k));
    assert.equal(balance(dest), expected.tokens);
    assert.ok(expected.tokens <= BigInt(book.walletCap));
    paid += expected.tokens;
    s.execute([ix], [s.attacker], "reject repeated claim", true);
  }
  assert.equal(balance(ata), initial - paid);
  assert.ok(initial - paid < 2n);
  assert.equal(
    s.svm.getBalance(address(vault)),
    s.svm.minimumBalanceForRentExemption(0n) + BigInt(book.leftover),
    "only protected vault rent and rounding remain",
  );
  console.log(
    JSON.stringify({
      scope: "ISOLATED_ENIGMA_VM",
      publicTransactions: false,
      hashes: s.hashes,
      received: book.received,
      creationCost: book.creationCost,
      paid: String(paid),
      dust: String(initial - paid),
      report,
    }),
  );
});

test("independent Enigma: additional windows keep vault budgets separate and terms immutable", async () => {
  const s = await independentFork(),
    c = s.client;
  s.execute([s.ix], [s.bank], "file first");
  let first = await s.read();
  const cfg = await c.decodeConfig(s.readAccount(await c.configAddress()));
  const second = await c.fileIx(pub(s.bank), cfg, {
    ...s.terms,
    duration: 3600,
  });
  s.execute([second.ix], [s.bank], "file 1-hour window");
  const o2 = await c.decodeOffering(
    s.readAccount(second.offering),
    second.offering,
  );
  assert.equal(o2.closesAt - o2.createdAt, 3600);
  assert.equal(first.closesAt - first.createdAt, 60);
  const ix = await c.commitIx(pub(s.a), first, 10_000_000n);
  const swapped = clone(ix);
  swapped.accounts[3].address = await c.vaultAddress(second.offering);
  s.execute([swapped], [s.a], "reject cross-offering vault", true);
  assert.equal((await s.read()).raised, "0");
  const donorBefore = s.svm.getBalance(address(pub(s.a)));
  s.execute([ix], [s.a], "valid first budget");
  const v1 = await c.vaultAddress(s.offering),
    v2 = await c.vaultAddress(second.offering);
  assert.equal(
    s.svm.getBalance(address(v1)),
    30_000_000n + s.svm.minimumBalanceForRentExemption(0n),
  );
  assert.equal(
    s.svm.getBalance(address(v2)),
    20_000_000n + s.svm.minimumBalanceForRentExemption(0n),
  );
  assert.ok(s.svm.getBalance(address(pub(s.a))) < donorBefore);
  // Reinitialization cannot alter a stored window or its cap.
  s.execute(
    [await c.initializeIx(pub(s.bank))],
    [s.bank],
    "reject reset",
    true,
  );
  first = await s.read();
  assert.equal(first.capBps, 50);
  assert.equal(first.closesAt - first.createdAt, 60);
  const cfg2 = await c.decodeConfig(s.readAccount(await c.configAddress()));
  const third = await c.fileIx(pub(s.bank), cfg2, {
    ...s.terms,
    duration: 17 * 60,
  });
  const stub = {
    address: third.offering,
    isNative: true,
    quoteMint: first.quoteMint,
    quoteTokenProgram: first.quoteTokenProgram,
  };
  const before = s.svm.getBalance(address(pub(s.bank)));
  s.execute(
    [third.ix, await c.commitIx(pub(s.bank), stub, 1_000_000_000n)],
    [s.bank],
    "atomic create/deposit rolls back an excessive first buy",
    true,
  );
  assert.equal(s.readAccount(third.offering), null);
  assert.equal(
    (await c.decodeConfig(s.readAccount(await c.configAddress()))).nextId,
    cfg2.nextId,
  );
  assert.equal(
    before - s.svm.getBalance(address(pub(s.bank))),
    5_000n,
    "failed atomic create charges only the network fee",
  );
  s.execute(
    [third.ix, await c.commitIx(pub(s.bank), stub, 10_000_000n)],
    [s.bank],
    "create window plus first deposit in one wallet transaction",
  );
  const o3 = await c.decodeOffering(
    s.readAccount(third.offering),
    third.offering,
  );
  assert.equal(o3.raised, "10000000");
  assert.equal(o3.closesAt - o3.createdAt, 17 * 60);
});
