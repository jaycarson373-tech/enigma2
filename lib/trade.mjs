import BN from "bn.js";
import legacy from "./pump-legacy.cjs";
import { raw, units, minimumOutput } from "./amounts.mjs";
import { readiness } from "./server.mjs";
import { to64 } from "./protocol.mjs";
import { TOKEN_2022, SOL, SYSTEM } from "./constants.mjs";
export async function tradeQuote(input) {
  const state = await readiness();
  if (!state.verified || state.stale || !state.writesEnabled)
    throw Error("Trading is paused for release verification.");
  const { pump, web3, spl } = legacy;
  const mint = new web3.PublicKey(input.mint),
    user = new web3.PublicKey(input.wallet),
    side = input.action;
  const slip = Number(input.slippageBps ?? 100);
  if (!Number.isInteger(slip) || slip < 10 || slip > 500)
    throw Error("Use slippage from 0.1% to 5%.");
  const rpc = new web3.Connection(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    { commitment: "finalized", disableRetryOnRateLimit: true },
  );
  const sdk = new pump.OnlinePumpSdk(rpc);
  const [global, feeConfig, buyState, mintInfo] = await Promise.all([
    sdk.fetchGlobal(),
    sdk.fetchFeeConfig(),
    sdk.fetchBuyState(mint, user, spl.TOKEN_2022_PROGRAM_ID),
    rpc.getAccountInfo(mint, "finalized"),
  ]);
  if (!mintInfo?.owner.equals(spl.TOKEN_2022_PROGRAM_ID))
    throw Error(
      "This release trades verified Token-2022 Pump coins. Use the external market for this mint.",
    );
  if (![SOL,SYSTEM].includes(buyState.quoteMint.toBase58()) || buyState.bondingCurve.complete)
    throw Error(
      "This market is migrated or uses another quote. Continue on its external Pump.fun market.",
    );
  const decodedMint=spl.unpackMint(mint,mintInfo,spl.TOKEN_2022_PROGRAM_ID);
  if(decodedMint.decimals!==6)throw Error("This market uses unsupported token decimals. Use its external market.");
  const mintSupply=decodedMint.supply;
  let ixs, out, inputRaw;
  if (side === "buy") {
    inputRaw = raw(input.amount);
    if (inputRaw <= 0n || inputRaw > 10000000000n)
      throw Error("Buy amounts must be above zero and at most 10 SOL.");
    const budget = new BN(String(inputRaw));
    out = pump.getBuyV3TokenAmountFromQuoteAmount({
      global,
      feeConfig,
      mintSupply: new BN(String(mintSupply)),
      bondingCurve: buyState.bondingCurve,
      amount: budget,
      curveBaseTokenBalance: buyState.curveBaseTokenBalance,
      quoteTransferFee: null,
    });
    ixs = await pump.PUMP_SDK.buyExactQuoteInV3Instructions({
      bondingCurve: buyState.bondingCurve,
      associatedUserAccountInfo: buyState.associatedUserAccountInfo,
      mint,
      user,
      amount: out,
      quoteAmount: budget,
      slippage: slip / 100,
      tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
      partialFill: false,
      buybackFeeRecipient: global.buybackFeeRecipients[0],
    });
  } else if (side === "sell") {
    inputRaw = raw(input.amount, 6);
    if (inputRaw <= 0n) throw Error("Enter the token amount to sell.");
    const amount = new BN(String(inputRaw));
    out = pump.getSellSolAmountFromTokenAmount({
      global,
      feeConfig,
      mintSupply: new BN(String(mintSupply)),
      bondingCurve: buyState.bondingCurve,
      amount,
      quoteTransferFee: null,
    });
    ixs = await pump.PUMP_SDK.sellV3Instructions({
      bondingCurve: buyState.bondingCurve,
      mint,
      user,
      amount,
      quoteAmount: out,
      slippage: slip / 100,
      tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
      buybackFeeRecipient: global.buybackFeeRecipients[0],
    });
  } else throw Error("Unknown trade action");
  if (BigInt(out.toString()) <= 0n)
    throw Error("This amount produces no output.");
  return {
    action: side,
    wallet: user.toBase58(),
    network: "mainnet-beta",
    program: pump.PUMP_PROGRAM_ID.toBase58(),
    mint: mint.toBase58(),
    offering: input.offering || "",
    issuedAt: Date.now(),
    lookupTable: state.lookupTable,
    details: {
      amount: String(input.amount),
      estimatedOut: units(out.toString(), side === "buy" ? 6 : 9),
      minimumOut: units(
        minimumOutput(out.toString(),slip,side === "buy"),
        side === "buy" ? 6 : 9,
      ),
      outSymbol: side === "buy" ? input.symbol || "tokens" : "SOL",
      slippageBps: slip,
      venue: "Pump.fun bonding curve",
      recipient: user.toBase58(),
    },
    ixs: ixs.map((i) => ({
      programAddress: i.programId.toBase58(),
      accounts: i.keys.map((k) => ({
        address: k.pubkey.toBase58(),
        role: (k.isSigner ? 2 : 0) | (k.isWritable ? 1 : 0),
      })),
      data: to64(i.data),
    })),
  };
}
