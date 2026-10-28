import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  v2Client,
  STONK,
  TOKEN,
  TOKEN_2022,
  LAUNCHLAB,
  GLOBAL,
  PLATFORM,
  to64,
  venueAddresses,
} from "./stonk-protocol.mjs";
import { raw, units, minimumOutput } from "./amounts.mjs";
import {
  readiness,
  offering,
  rpc,
  stonkTerms,
  decodeStonkPool,
} from "./server.mjs";
import launchlab from "./launchlab-sdk.cjs";
const sdk = launchlab.sdk;
export async function buildStonkTrade(input, poolAccount, fees, slot) {
  const mint = new PublicKey(input.mint),
    wallet = new PublicKey(input.wallet),
    quote = new PublicKey(STONK),
    program = new PublicKey(LAUNCHLAB),
    platform = new PublicKey(PLATFORM),
    config = new PublicKey(GLOBAL);
  const side = input.action;
  if (!["buy", "sell"].includes(side)) throw Error("Unknown trade action.");
  const slip = Number(input.slippageBps ?? 100);
  if (!Number.isInteger(slip) || slip < 10 || slip > 500)
    throw Error("Use slippage from 0.1% to 5%.");
  const p = decodeStonkPool(poolAccount, mint.toBase58());
  if (p.status !== 0)
    throw Error(
      "This curve has migrated. Continue on its external Stonk.fun market.",
    );
  const amount = raw(input.amount, side === "buy" ? 9 : 6);
  if (amount <= 0n) throw Error("Enter an amount above zero.");
  const rates = {
    poolInfo: p,
    protocolFeeRate: new BN(fees.protocolFeeRate),
    platformFeeRate: new BN(fees.platformFeeRate),
    creatorFeeRate: new BN(fees.creatorFeeRate),
    shareFeeRate: new BN(0),
    curveType: 0,
    transferFeeConfigA: undefined,
    slot,
  };
  const quoted =
    side === "buy"
      ? sdk.Curve.buyExactIn({ ...rates, amountB: new BN(String(amount)) })
      : sdk.Curve.sellExactIn({ ...rates, amountA: new BN(String(amount)) });
  if (
    side === "buy" &&
    (quoted.amountB.toString() !== String(amount) ||
      quoted.amountA.amount.gte(p.totalSellA.sub(p.realA)))
  )
    throw Error(
      "This amount would finish the curve. Use the external Stonk.fun market.",
    );
  const out = side === "buy" ? quoted.amountA.amount : quoted.amountB;
  if (out.lten(0)) throw Error("This amount produces no output.");
  const minimum = minimumOutput(out.toString(), slip, true),
    pool = await v2Client.curveAddress(mint.toBase58()),
    a = await venueAddresses();
  const baseAta = getAssociatedTokenAddressSync(
      mint,
      wallet,
      false,
      TOKEN_2022_PROGRAM_ID,
    ),
    quoteAta = getAssociatedTokenAddressSync(
      quote,
      wallet,
      false,
      TOKEN_PROGRAM_ID,
    );
  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(
      wallet,
      baseAta,
      wallet,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      wallet,
      quoteAta,
      wallet,
      quote,
      TOKEN_PROGRAM_ID,
    ),
  ];
  const builder =
    side === "buy" ? sdk.buyExactInInstruction : sdk.sellExactInInstruction;
  instructions.push(
    builder(
      program,
      wallet,
      new PublicKey(a.auth),
      config,
      platform,
      new PublicKey(pool),
      baseAta,
      quoteAta,
      p.vaultA,
      p.vaultB,
      mint,
      quote,
      TOKEN_2022_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      new PublicKey(a.platformFee),
      sdk.getPdaCreatorVault(program, p.creator, quote).publicKey,
      new BN(String(amount)),
      new BN(String(minimum)),
    ),
  );
  return {
    action: side,
    wallet: wallet.toBase58(),
    program: LAUNCHLAB,
    network: "mainnet-beta",
    mint: mint.toBase58(),
    offering: input.offering,
    issuedAt: Date.now(),
    lookupTable: { address: "11111111111111111111111111111111", addresses: [] },
    details: {
      amount: String(input.amount),
      estimatedOut: units(out.toString(), side === "buy" ? 6 : 9),
      minimumOut: units(minimum, side === "buy" ? 6 : 9),
      outSymbol: side === "buy" ? input.symbol || "tokens" : "STONK",
      slippageBps: slip,
      quoteSymbol: "STONK",
      quoteMint: STONK,
      quoteDebitRaw: side === "buy" ? String(amount) : "0",
      venue: "Stonk.fun LaunchLab",
      recipient: wallet.toBase58(),
    },
    ixs: instructions.map((i) => ({
      programAddress: i.programId.toBase58(),
      accounts: i.keys.map((k) => ({
        address: k.pubkey.toBase58(),
        role: (k.isSigner ? 2 : 0) | (k.isWritable ? 1 : 0),
      })),
      data: to64(i.data),
    })),
  };
}
export async function tradeQuote(input) {
  const state = await readiness();
  if (!state.verified || state.stale || !state.writesEnabled)
    throw Error("Trading is paused for release verification.");
  const book = await offering(input.offering);
  if (book.status !== "launched" || book.mint !== input.mint)
    throw Error("This is not a launched Enigma 2 mint.");
  const result = await rpc("getAccountInfo", [
    await v2Client.curveAddress(input.mint),
    { encoding: "base64", commitment: "finalized" },
  ]);
  return buildStonkTrade(
    input,
    result.value,
    await stonkTerms(),
    result.context.slot,
  );
}
