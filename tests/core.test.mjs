import { test } from "node:test";
import assert from "node:assert/strict";
import {
  durationSeconds,
  WINDOW_PRESETS,
  PROGRAM,
  PROGRAM_DATA,
  CODE_HASH,
  DEPLOYMENT_SLOT,
  SYSTEM,
} from "../lib/constants.mjs";
import {
  raw,
  units,
  entitlement,
  allocationEstimate,
  minimumOutput,
} from "../lib/amounts.mjs";
import { validateTerms } from "../lib/prepare.mjs";
import {
  fileIx,
  configAddress,
  decodeConfig,
  decodeOffering,
  discriminator,
  bytes64,
} from "../lib/protocol.mjs";
import {
  verifyDeployment,
  failClosed,
  MAINNET_GENESIS,
  LOADER,
} from "../lib/deployment.mjs";
import { verifyLaunchReceipt } from "../lib/receipt.mjs";
import { getBase58Decoder, getBase58Encoder } from "@solana/kit";
import { createHash } from "node:crypto";
const cfg = {
  minDuration: 30,
  maxDuration: 2592000,
  minCapBps: 10,
  maxCapBps: 1000,
  nextId: "12",
  treasury: SYSTEM,
};
const terms = {
  name: "Enigma Test",
  symbol: "lower",
  uri: "https://ipfs.io/ipfs/test",
  minutes: 3,
  capBps: 50,
};
test("custom windows cover every whole minute from 1 to 60, locked in instruction bytes", async () => {
  for (let m = 1; m <= 60; m++) {
    const t = validateTerms({ ...terms, minutes: m }, cfg);
    assert.equal(t.duration, m * 60);
    const { ix } = await fileIx(SYSTEM, cfg, t);
    const b = ix.data;
    const durationOffset =
      8 +
      4 +
      Buffer.byteLength(t.name) +
      4 +
      Buffer.byteLength(t.symbol) +
      4 +
      Buffer.byteLength(t.uri);
    assert.equal(
      new DataView(b.buffer, b.byteOffset, b.byteLength).getBigInt64(
        durationOffset,
        true,
      ),
      BigInt(m * 60),
    );
  }
  assert.deepEqual(WINDOW_PRESETS, [1, 3, 5, 10, 15, 30, 60]);
  for (const m of [0, 61, -1, 1.5, Infinity, NaN, "", "abc"])
    assert.throws(() => durationSeconds(m));
  assert.throws(
    () => validateTerms({ ...terms, minutes: 1 }, { ...cfg, minDuration: 120 }),
    /protocol limits/,
  );
});
test("invalid metadata, case-preserved ticker and protocol cap are checked before signing", () => {
  assert.equal(validateTerms(terms, cfg).symbol, "lower");
  for (const uri of [
    "http://ipfs.io/x",
    "https://ipfs.io.evil.com/x",
    "https://127.0.0.1/x",
  ])
    assert.throws(() => validateTerms({ ...terms, uri }, cfg));
  assert.throws(() => validateTerms({ ...terms, capBps: 1001 }, cfg));
  assert.throws(() => validateTerms({ ...terms, name: "🐈".repeat(9) }, cfg));
});
test("integer amounts, weight allocation and dust conserve budgets", () => {
  assert.equal(raw("0.000000001"), 1n);
  assert.equal(units(1234567n, 6), "1.234567");
  for (const n of ["-1", "1e3", "0.0000000001", "18446744074"])
    assert.throws(() => raw(n));
  const b = { totalWeight: "3", received: "10", leftover: "5" };
  const a = entitlement(b, { weight: "1" }),
    c = entitlement(b, { weight: "2" });
  assert.equal(a.tokens + c.tokens, 9n);
  assert.equal(a.change + c.change, 4n);
  assert.ok(a.tokens + c.tokens <= BigInt(b.received));
  assert.deepEqual(entitlement({ ...b, totalWeight: "0" }, { weight: "1" }), {
    tokens: 0n,
    change: 0n,
  });
  assert.equal(minimumOutput(101n, 100), 100n);
  assert.equal(minimumOutput(0n, 100, true), 1n);
});
test("later deposits receive a different curve stretch, not equal-price fabricated allocations", () => {
  const b = {
    raised: "0",
    vToken: "1073000000000000",
    vPair: "30000000000",
    feeBps: 250,
    curveSupply: "793100000000000",
  };
  const first = allocationEstimate(b, 50000000n),
    next = allocationEstimate({ ...b, raised: "50000000" }, 50000000n);
  assert.ok(first > next);
  assert.ok(next > 0n);
});
test("closed programs, wrong owners and stale evidence cannot authorize writes", () => {
  const p = Buffer.concat([
    Buffer.from([2, 0, 0, 0]),
    Buffer.from(getBase58Encoder().encode(PROGRAM_DATA)),
  ]);
  const account = {
    owner: LOADER,
    executable: true,
    data: [p.toString("base64"), "base64"],
  };
  assert.throws(
    () => verifyDeployment(MAINNET_GENESIS, account, null),
    /unavailable/,
  );
  assert.throws(
    () => verifyDeployment("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", account, null),
    /mainnet/,
  );
  assert.throws(() =>
    verifyDeployment(MAINNET_GENESIS, { ...account, owner: SYSTEM }, null),
  );
  const s = failClosed({
    verified: true,
    writesEnabled: true,
    filingEnabled: true,
    stale: true,
  });
  assert.equal(s.writesEnabled, false);
  assert.equal(s.filingEnabled, false);
});
test("account decoders reject owner, discriminator and offering identity mismatches", async () => {
  await assert.rejects(
    () => decodeConfig({ owner: SYSTEM, data: ["", "base64"] }),
    /owner/,
  );
  await assert.rejects(
    () =>
      decodeOffering(
        {
          owner: PROGRAM,
          data: [Buffer.alloc(450).toString("base64"), "base64"],
        },
        SYSTEM,
      ),
    /identity/,
  );
});
test("receipt verification requires successful atomic Enigma launch and inner Pump creation/buy", async () => {
  const encode = async (n) =>
    getBase58Decoder().decode(await discriminator("global:" + n));
  const book = {
    status: "launched",
    address: SYSTEM,
    mint: PROGRAM_DATA,
    raised: "1",
  };
  const top = {
    programId: PROGRAM,
    accounts: [PROGRAM, book.mint, book.address],
    data: await encode("launch"),
  };
  const inner = (n) => ({
    programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    accounts: [book.mint],
    data: n,
  });
  const tx = {
    meta: {
      err: null,
      innerInstructions: [
        {
          index: 0,
          instructions: [
            inner(await encode("create_v2")),
            inner(await encode("buy_exact_quote_in_v3")),
          ],
        },
      ],
    },
    transaction: { message: { instructions: [top] } },
  };
  assert.equal(await verifyLaunchReceipt(tx, book), true);
  assert.equal(
    await verifyLaunchReceipt(
      { ...tx, meta: { ...tx.meta, err: "failed" } },
      book,
    ),
    false,
  );
  assert.equal(
    await verifyLaunchReceipt(
      { ...tx, meta: { err: null, innerInstructions: [] } },
      book,
    ),
    false,
  );
  assert.equal(await verifyLaunchReceipt(tx, { ...book, mint: SYSTEM }), false);
});

test("upstream errors cannot expose RPC URLs or credentials", async () => {
  const { publicError } = await import("../lib/http.mjs");
  assert.equal(
    publicError(Error("failed https://rpc.example/?api-key=secret"), "retry"),
    "retry",
  );
  assert.equal(
    publicError(Error("Choose a window from 1 to 60 minutes."), "retry"),
    "Choose a window from 1 to 60 minutes.",
  );
});

test("independent deployment remains disabled before public activation and artifact matches release", async () => {
  const { readiness, feed } = await import("../lib/server.mjs");
  const { deployment } = await import("../lib/enigma-deployment.mjs");
  const { readFileSync } = await import("node:fs");
  assert.equal(deployment.status, "built-not-deployed");
  assert.equal(
    createHash("sha256")
      .update(
        readFileSync(new URL("../releases/v1/enigma.so", import.meta.url)),
      )
      .digest("hex"),
    deployment.codeHash,
  );
  const state = await readiness();
  assert.equal(state.writesEnabled, false);
  assert.equal(state.verified, false);
  const live = await feed();
  assert.deepEqual(live.offers, []);
  assert.equal(live.stats.launches, 0);
  assert.match(live.source, /IPO/);
});

test("SPL layouts resolve the bounded pure-JS converter, not the vulnerable native copy", async () => {
  const { createRequire } = await import("node:module");
  const { realpathSync } = await import("node:fs");
  const require = createRequire(import.meta.url);
  const nested = createRequire(require.resolve("@solana/buffer-layout-utils"));
  assert.match(
    realpathSync(nested.resolve("bigint-buffer")),
    /vendor\/bigint-buffer\/index\.cjs$/,
  );
  const converter = nested("bigint-buffer");
  for (const width of [0, 1, 8, 16, 32]) {
    const value = width ? (1n << BigInt(width * 8)) - 1n : 0n;
    assert.equal(
      converter.toBigIntLE(converter.toBufferLE(value, width)),
      value,
    );
    assert.equal(
      converter.toBigIntBE(converter.toBufferBE(value, width)),
      value,
    );
  }
  assert.throws(() => converter.toBufferLE(256n, 1));
  assert.throws(() => converter.toBufferLE(-1n, 8));
  assert.throws(() => converter.toBigIntLE(Buffer.alloc(4097)));
  const { u64 } = await import("@solana/buffer-layout-utils");
  const bytes = Buffer.alloc(8);
  u64().encode(123456789n, bytes, 0);
  assert.equal(u64().decode(bytes, 0), 123456789n);
});
