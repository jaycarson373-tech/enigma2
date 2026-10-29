import { address } from "@solana/kit";
import {
  v2Client,
  STONK,
  V2_PROGRAM,
  to64,
  CREATION_BUDGET,
} from "./stonk-protocol.mjs";
import { raw, units } from "./amounts.mjs";
import { readiness, offering, stonkTerms } from "./server.mjs";
import { validateTerms } from "./stonk-terms.mjs";
export async function prepare(input) {
  const wallet = String(address(input.wallet)),
    state = await readiness();
  if (!state.verified || state.stale || !state.writesEnabled)
    throw Error(
      state.reason || "Wallet actions are paused for release verification.",
    );
  const action = input.action;
  let ixs = [],
    book = null,
    offerAddress = null,
    details = {},
    ephemeralMint = null;
  if (action === "create") {
    if (!state.filingEnabled)
      throw Error(state.reason || "New launch windows are paused.");
    const terms = {
      ...validateTerms(input, state.config),
      raise: (await stonkTerms()).raiseRaw,
    };
    const p = await v2Client.fileIx(wallet, state.config, terms);
    offerAddress = p.offering;
    ixs.push(p.ix);
    const amount = raw(input.initialDeposit || "0");
    if (amount > 0n)
      ixs.push(
        await v2Client.commitIx(wallet, { address: p.offering }, amount),
      );
    details = {
      ...terms,
      quoteSymbol: "STONK",
      quoteMint: STONK,
      initialDeposit: units(amount),
      quoteDebitRaw: String(amount),
      creationBudget: units(CREATION_BUDGET),
      creationBudgetSymbol: "SOL",
      capPercent: String(terms.capBps / 100),
      refunds: false,
    };
  } else {
    book = await offering(String(address(input.offering)));
    offerAddress = book.address;
    if (book.version !== 2 || book.quoteMint !== STONK)
      throw Error("This is not an Openbell v2 STONK pool.");
    if (action === "deposit") {
      if (book.status !== "open" || book.closesAt <= Date.now() / 1000)
        throw Error("This deposit window has closed.");
      const amount = raw(input.amount);
      if (amount <= 0n) throw Error("Enter a STONK amount above zero.");
      ixs.push(await v2Client.commitIx(wallet, book, amount));
      details = {
        amount: units(amount),
        quoteDebitRaw: String(amount),
        quoteSymbol: "STONK",
        quoteMint: STONK,
        name: book.name,
        symbol: book.symbol,
        refunds: false,
      };
    } else if (action === "launch") {
      if (book.status !== "open" || book.closesAt > Date.now() / 1000)
        throw Error("The pool is not ready for finalization.");
      ephemeralMint = String(address(input.mint));
      ixs.push(await v2Client.launchIx(wallet, ephemeralMint, book));
      details = {
        name: book.name,
        symbol: book.symbol,
        poolStonk: units(book.raised),
        quoteSymbol: "STONK",
        mint: ephemeralMint,
        creationBudget: units(book.deposit),
        finalizer: wallet,
      };
    } else if (action === "claim") {
      ixs.push(await v2Client.claimIx(wallet, wallet, book));
      details = {
        name: book.name,
        symbol: book.symbol,
        recipient: wallet,
        mint: book.mint,
        quoteSymbol: "STONK",
      };
    } else throw Error("Unknown wallet action.");
  }
  return {
    action,
    wallet,
    program: V2_PROGRAM,
    network: "mainnet-beta",
    offering: offerAddress,
    book,
    details,
    ixs: ixs.map((ix) => ({ ...ix, data: to64(ix.data) })),
    lookupTable: state.lookupTable,
    issuedAt: Date.now(),
    ephemeralMint,
    notice:
      "Openbell v2 STONK escrow. Deposits are final. SOL pays account rent and network fees. Wallet caps do not prevent multiple-wallet participation.",
  };
}
