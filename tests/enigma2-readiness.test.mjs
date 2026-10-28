import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertArtifact, releaseIdentity } from "../lib/release-v2-flow.mjs";
import { createRequire } from "node:module";
import {
  enigma2Release,
  assertEnigma2Implemented,
} from "../lib/enigma2-release.mjs";
import {
  validateStonkPricing,
  verifyStonkVenue,
  stonkRuleAllows,
} from "../lib/stonk-readiness.mjs";
import { validateRequest } from "../lib/rpc-policy.mjs";
const sdk = createRequire(import.meta.url)("@raydium-io/raydium-sdk-v2");
const snapshot = JSON.parse(
  readFileSync(
    new URL("../fixtures/stonk/venue-snapshot.json", import.meta.url),
  ),
);
const now = Date.parse(snapshot.pricing.prices.observedAt);
const genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
function reader(accounts = snapshot.accounts, cluster = genesis) {
  return async (method) => {
    if (method === "getGenesisHash") return cluster;
    assert.equal(
      method,
      "getMultipleAccounts",
      "verification must never request a write",
    );
    return accounts;
  };
}

test("a built v2 artifact and an enabled write flag do not authorize undeployed public actions", async () => {
  const { readiness, feed } = await import("../lib/server.mjs");
  const previous = process.env.ENIGMA_WRITES_ENABLED;
  process.env.ENIGMA_WRITES_ENABLED = "true";
  try {
    const state = await readiness();
    assert.equal(state.protocol, "Enigma 2");
    assert.equal(state.quoteSymbol, "STONK");
    assert.equal(state.program, null);
    assert.equal(state.writesEnabled, false);
    assert.equal(state.filingEnabled, false);
    assert.equal((await feed()).stats.launches, 0);
    assert.doesNotThrow(assertEnigma2Implemented);
    for (const method of ["sendTransaction", "simulateTransaction"])
      await assert.rejects(
        () => validateRequest({ method, params: [""] }, state),
        /paused/,
      );
    await validateRequest({ method: "getBalance", params: [genesis] }, state);
  } finally {
    if (previous === undefined) delete process.env.ENIGMA_WRITES_ENABLED;
    else process.env.ENIGMA_WRITES_ENABLED = previous;
  }
});

test("the v2 release verifies only its own artifact and derives distinct wallet-owned addresses", async () => {
  const code = readFileSync(
    new URL("../releases/v2/enigma2.so", import.meta.url),
  );
  await assertArtifact(code);
  await assert.rejects(
    () =>
      assertArtifact(
        readFileSync(new URL("../releases/v1/enigma.so", import.meta.url)),
      ),
    /artifact/,
  );
  const corrupt = new Uint8Array(code);
  corrupt[corrupt.length - 1] ^= 1;
  await assert.rejects(() => assertArtifact(corrupt), /artifact/);
  const id = await releaseIdentity("11111111111111111111111111111111");
  assert.match(id.programSeed, /^enigma-p-v2-/);
  assert.notEqual(id.program, id.buffer);
});

test("finalized Stonk venue reads plus isolated execution do not establish public mainnet readiness", async () => {
  const result = await verifyStonkVenue(snapshot.pricing, reader(), now);
  assert.equal(result.quoteMint, enigma2Release.quoteMint);
  assert.equal(result.venueAccountsVerified, true);
  assert.equal(
    result.baseTokenProgram,
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  );
  assert.equal(result.transferFeeEnabled, false);
  assert.equal(result.mainnetReady, false);
  assert.equal(result.upstreamBytecodePinned, false);
  assert.equal(result.enigma2LifecyclePassed, true);
  assert.equal(result.submitted, false);
  assert.equal(result.protocolFeeRate, "2500");
  assert.equal(result.platformFeeRate, "10000");
});

test("pricing rejects SOL substitution, stale/missing times, malicious platform/PDA and unsafe amounts", () => {
  const changes = [
    (p) => {
      p.quote.mint = "So11111111111111111111111111111111111111112";
    },
    (p) => {
      p.prices.observedAt = "invalid";
    },
    (p) => {
      p.prices.observedAt = new Date(now - 180001).toISOString();
    },
    (p) => {
      p.prices.observedAt = new Date(now + 30001).toISOString();
    },
    (p) => {
      p.platform.standard = p.quote.mint;
    },
    (p) => {
      p.curveRule.standard = p.quote.mint;
    },
    (p) => {
      p.allowConfig.standard = p.quote.mint;
    },
    (p) => {
      p.raise.raw = "18446744073709551616";
    },
    (p) => {
      p.curve.supply = 1e15;
    },
    (p) => {
      p.curve.totalSellA = p.curve.supply;
    },
    (p) => {
      p.modes.standard.transferFee = { basisPoints: 100 };
    },
  ];
  for (const change of changes) {
    const p = structuredClone(snapshot.pricing);
    change(p);
    assert.throws(() => validateStonkPricing(p, now));
  }
});

test("finalized verification rejects a wrong network, missing account, wrong owner, mint decimals and executable identity", async () => {
  await assert.rejects(
    () =>
      verifyStonkVenue(
        snapshot.pricing,
        reader(snapshot.accounts, "devnet"),
        now,
      ),
    /mainnet/,
  );
  for (const mutate of [
    (a) => {
      a.value[1] = null;
    },
    (a) => {
      a.value[2].owner = enigma2Release.quoteMint;
    },
    (a) => {
      a.value[0].executable = false;
    },
    (a) => {
      a.value[3].data[0] = Buffer.alloc(82).toString("base64");
    },
    (a) => {
      a.context = {};
    },
    (a) => {
      a.value.pop();
    },
  ]) {
    const a = structuredClone(snapshot.accounts);
    mutate(a);
    await assert.rejects(() =>
      verifyStonkVenue(snapshot.pricing, reader(a), now),
    );
  }
});

test("an enforced allowlist with no allow-config account fails even if the API claims availability", async () => {
  const accounts = structuredClone(snapshot.accounts);
  const bytes = Buffer.from(accounts.value[2].data[0], "base64");
  const platform = sdk.PlatformConfig.decode(bytes);
  platform.restrictGlobalConfig = 1;
  sdk.PlatformConfig.encode(platform, bytes);
  accounts.value[2].data[0] = bytes.toString("base64");
  accounts.value[4] = null;
  await assert.rejects(
    () => verifyStonkVenue(snapshot.pricing, reader(accounts), now),
    /PlatformAllowConfig/,
  );
});

test("unknown curve-rule fields or operators cannot authorize a launch", () => {
  const data = Buffer.from(snapshot.accounts.value[5].data[0], "base64");
  const rule = sdk.PlatformCurveRule.decode(data);
  assert.equal(stonkRuleAllows(snapshot.pricing, rule, false, now), false);
  assert.equal(stonkRuleAllows(snapshot.pricing, rule, true, now), true);
  rule.groups[0].constraints[0].field = 255;
  assert.equal(stonkRuleAllows(snapshot.pricing, rule, true, now), false);
  rule.groups[0].constraints[0].field = 0;
  rule.groups[0].constraints[0].op = 255;
  assert.equal(stonkRuleAllows(snapshot.pricing, rule, true, now), false);
});
