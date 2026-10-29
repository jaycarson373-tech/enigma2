// Read-only venue verification. This never prepares, signs or sends a transaction.
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { enigma2Release as target } from "./enigma2-release.mjs";

import launchlab from "./launchlab-sdk.cjs";
const sdk = launchlab.sdk;
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const MAINNET = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const requireValue = (ok, message) => {
  if (!ok) throw Error(message);
};
const key = (value) => {
  requireValue(typeof value === "string", "Missing Stonk address.");
  const result = new PublicKey(value);
  requireValue(result.toBase58() === value, "Invalid Stonk address.");
  return result;
};
const atoms = (value) => {
  requireValue(
    typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value),
    "Invalid Stonk integer amount.",
  );
  const result = BigInt(value);
  requireValue(
    result <= 18446744073709551615n,
    "Stonk integer amount exceeds u64.",
  );
  return result;
};
const disc = (name) =>
  createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
function bytes(account, name, size) {
  requireValue(
    account &&
      account.owner === target.launchlabProgram &&
      account.executable === false &&
      account.data?.[1] === "base64",
    `Unverified Stonk ${name} owner.`,
  );
  const data = Buffer.from(account.data[0], "base64");
  requireValue(
    (size === undefined
      ? data.length >= 8 && data.length <= 8192
      : data.length === size) && data.subarray(0, 8).equals(disc(name)),
    `Unsupported Stonk ${name} layout.`,
  );
  return data;
}

export function validateStonkPricing(p, now = Date.now()) {
  requireValue(
    p?.quote?.mint === target.quoteMint &&
      p.quote.decimals === target.quoteDecimals &&
      p.quote.tokenProgram === TOKEN,
    "Openbell v2 requires the STONK quote mint and its verified decimals.",
  );
  requireValue(
    p?.curve?.programId === target.launchlabProgram &&
      p?.platform?.standard === target.platform,
    "Unexpected Stonk program or platform.",
  );
  const age = now - Date.parse(p?.prices?.observedAt);
  requireValue(
    Number.isFinite(age) && age >= -30000 && age <= 180000,
    "Stonk pricing is missing or stale.",
  );
  requireValue(
    p.curve.curveType === "ConstantCurve" &&
      p.curve.migrateType === "cpmm" &&
      p.curve.baseDecimals === 6 &&
      p.curve.cpmmCreatorFeeOn === 0,
    "Unsupported Stonk curve shape.",
  );
  requireValue(
    p?.modes?.standard?.transferFee === null &&
      ["totalLockedAmount", "cliffPeriod", "unlockPeriod"].every(
        (k) => p.curve.vesting?.[k] === "0",
      ),
    "Unsupported Stonk transfer fee or vesting.",
  );
  const supply = atoms(p.curve.supply),
    sell = atoms(p.curve.totalSellA),
    raise = atoms(p?.raise?.raw);
  requireValue(
    supply === 1_000_000_000_000_000n &&
      sell === 793_100_000_000_000n &&
      raise > 0n,
    "Invalid Stonk supply or raise.",
  );
  const program = key(target.launchlabProgram),
    platform = key(target.platform),
    config = key(p.curve.configId);
  requireValue(
    sdk
      .getPdaPlatformCurveRule(program, platform, config)
      .publicKey.toBase58() === p?.curveRule?.standard,
    "Stonk curve-rule PDA mismatch.",
  );
  requireValue(
    sdk
      .getPdaPlatformAllowConfig(program, platform, config)
      .publicKey.toBase58() === p?.allowConfig?.standard,
    "Stonk allow-config PDA mismatch.",
  );
  return { supply, sell, raise, program, platform, config };
}

export function stonkRuleAllows(p, rule, token2022, now = Date.now()) {
  const supply = atoms(p.curve.supply),
    sell = atoms(p.curve.totalSellA),
    raise = atoms(p.raise.raw);
  if (supply === 0n) return false;
  const fields = [
    0n,
    1n,
    0n,
    supply,
    sell,
    raise,
    0n,
    0n,
    0n,
    token2022 ? 1n : 0n,
    0n,
    0n,
    0n,
    (sell * 1000000n) / supply,
    0n,
    supply - sell,
    ((supply - sell) * 1000000n) / supply,
    (raise * 1000000n) / supply,
    BigInt(Math.floor(now / 1000)),
  ];
  if (
    !Array.isArray(rule.groups) ||
    !rule.groups.length ||
    rule.groups.length > 10
  )
    return false;
  return rule.groups.some(
    (group) =>
      group.constraints.length > 0 &&
      group.constraints.length <= 25 &&
      group.constraints.every(({ field, op, value }) => {
        const actual = fields[field],
          expected = BigInt(value.toString(10));
        if (actual === undefined) return false;
        return op === 0
          ? actual === expected
          : op === 1
            ? actual >= expected
            : op === 2
              ? actual <= expected
              : op === 3
                ? actual !== expected
                : false;
      }),
  );
}

export async function verifyStonkVenue(p, read, now = Date.now()) {
  const { supply, sell, raise, program, config } = validateStonkPricing(p, now);
  requireValue(
    (await read("getGenesisHash")) === MAINNET,
    "Stonk verification requires Solana mainnet.",
  );
  const keys = [
    target.launchlabProgram,
    p.curve.configId,
    target.platform,
    target.quoteMint,
    p.allowConfig.standard,
    p.curveRule.standard,
  ];
  const result = await read("getMultipleAccounts", [
    keys,
    { encoding: "base64", commitment: "finalized" },
  ]);
  requireValue(
    Number.isSafeInteger(result?.context?.slot) &&
      Array.isArray(result.value) &&
      result.value.length === keys.length,
    "Incomplete finalized Stonk snapshot.",
  );
  const [executable, c, platform, mint, allow, ruleAccount] = result.value;
  requireValue(
    executable?.owner === LOADER &&
      executable.executable === true &&
      executable.data?.[1] === "base64",
    "Stonk executable is unavailable.",
  );
  const loader = Buffer.from(executable.data[0], "base64");
  const programData = PublicKey.findProgramAddressSync(
    [program.toBuffer()],
    new PublicKey(LOADER),
  )[0];
  requireValue(
    loader.length === 36 &&
      loader.readUInt32LE(0) === 2 &&
      loader.subarray(4).equals(programData.toBuffer()),
    "Stonk loader identity mismatch.",
  );
  const configInfo = sdk.LaunchpadConfig.decode(
    bytes(c, "GlobalConfig", sdk.LaunchpadConfig.span),
  );
  const platformInfo = sdk.PlatformConfig.decode(
    bytes(platform, "PlatformConfig", sdk.PlatformConfig.span),
  );
  requireValue(
    configInfo.curveType === 0 &&
      configInfo.mintB.toBase58() === target.quoteMint &&
      sdk
        .getPdaLaunchpadConfigId(
          program,
          key(target.quoteMint),
          0,
          configInfo.index,
        )
        .publicKey.equals(config),
    "Stonk global-config identity mismatch.",
  );
  const mintData = Buffer.from(mint?.data?.[0] || "", "base64");
  requireValue(
    mint?.owner === TOKEN &&
      mint.executable === false &&
      mint.data?.[1] === "base64" &&
      mintData.length === 82 &&
      mintData[44] === 9 &&
      mintData[45] === 1,
    "Unverified STONK mint layout or decimals.",
  );
  requireValue(
    raise >= BigInt(configInfo.minFundRaisingB.toString(10)) &&
      supply >= BigInt(configInfo.minSupplyA.toString(10)),
    "Stonk pricing is below the global minimum.",
  );
  requireValue(
    [0, 1].includes(platformInfo.restrictGlobalConfig) &&
      [0, 1].includes(platformInfo.restrictCurveParam),
    "Unknown Stonk restriction mode.",
  );
  if (platformInfo.restrictGlobalConfig === 1)
    bytes(allow, "PlatformAllowConfig");
  // Always verify the published rule, even if enforcement is temporarily disabled.
  const rule = sdk.PlatformCurveRule.decode(
    bytes(ruleAccount, "PlatformCurveRule"),
  );
  requireValue(
    rule.version === 1 &&
      rule.platformId.toBase58() === target.platform &&
      rule.configId.toBase58() === p.curve.configId,
    "Stonk curve-rule identity or version mismatch.",
  );
  const splAllowed = stonkRuleAllows(p, rule, false, now),
    token2022Allowed = stonkRuleAllows(p, rule, true, now);
  requireValue(
    splAllowed || token2022Allowed,
    "Stonk pricing conflicts with its onchain rule.",
  );
  const fees = [
    configInfo.tradeFeeRate,
    platformInfo.feeRate,
    platformInfo.creatorFeeRate,
  ].map((v) => BigInt(v.toString(10)));
  requireValue(
    fees.every((v) => v >= 0n) && fees.reduce((a, b) => a + b, 0n) <= 50000n,
    "Unsupported Stonk fee rates.",
  );
  const reserves = sdk.Curve.getCurve(0).getInitParam({
    supply: new BN(String(supply)),
    totalSell: new BN(String(sell)),
    totalFundRaising: new BN(String(raise)),
    totalLockedAmount: new BN(0),
    migrateFee: configInfo.migrateFee,
  });
  requireValue(
    reserves.a.gt(new BN(String(sell))) && reserves.b.gtn(0),
    "Invalid Stonk initial reserves.",
  );
  return {
    scope: "READ_ONLY_STONK_VENUE_CHECK",
    realFundsSpent: false,
    signed: false,
    submitted: false,
    mainnetVerified: true,
    venueAccountsVerified: true,
    slot: result.context.slot,
    program: target.launchlabProgram,
    programData: programData.toBase58(),
    platform: target.platform,
    quoteMint: target.quoteMint,
    quoteSymbol: "STONK",
    quoteDecimals: 9,
    globalConfig: p.curve.configId,
    curveRule: p.curveRule.standard,
    allowConfig: p.allowConfig.standard,
    onchainAllowlistRequired: platformInfo.restrictGlobalConfig === 1,
    apiAllowlistRequired: p.allowConfig.required?.standard ?? null,
    onchainCurveRuleRequired: platformInfo.restrictCurveParam === 1,
    baseTokenProgram: splAllowed ? TOKEN : TOKEN_2022,
    transferFeeEnabled: false,
    supplyRaw: String(supply),
    sellRaw: String(sell),
    raiseRaw: String(raise),
    virtualTokenRaw: reserves.a.toString(10),
    virtualQuoteRaw: reserves.b.toString(10),
    feeDenominator: "1000000",
    protocolFeeRate: String(fees[0]),
    platformFeeRate: String(fees[1]),
    creatorFeeRate: String(fees[2]),
    pricingObservedAt: p.prices.observedAt,
    checkedAt: new Date(now).toISOString(),
    // Account identity checks are not executable pinning or execution acceptance.
    upstreamBytecodePinned: false,
    enigma2ArtifactBuilt: !!target.codeHash,
    enigma2LifecyclePassed: target.isolatedExecutionPassed === true,
    publicExecutionAccepted: false,
    mainnetReady: false,
    activation: false,
  };
}
