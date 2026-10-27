import { address } from "@solana/kit";
import { durationSeconds, PROGRAM, SOL } from "./constants.mjs";
import { fileIx, commitIx, claimIx, launchIx, to64 } from "./protocol.mjs";
import { readiness, offering } from "./server.mjs";
import { raw, units } from "./amounts.mjs";
import legacy from "./pump-legacy.cjs";
const pack = (ix) => ({ ...ix, data: to64(ix.data) });
export function validateTerms(input, config) {
  const name = String(input.name || "").trim(),
    symbol = String(input.symbol || "").trim(),
    uri = String(input.uri || "");
  if (!name || new TextEncoder().encode(name).length > 32)
    throw Error("Use a name up to 32 bytes.");
  if (!/^[A-Za-z0-9]{1,10}$/.test(symbol))
    throw Error(
      "Use 1–10 letters or digits for the ticker. Lowercase is supported.",
    );
  if (
    !/^https:\/\/(ipfs\.io|gateway\.pinata\.cloud|[a-z0-9.-]+\.public\.blob\.vercel-storage\.com)\//.test(
      uri,
    ) &&
    !/^https:\/\/arweave.net\/[A-Za-z0-9_-]+$/.test(uri)
  )
    throw Error("Upload the coin image and metadata before review.");
  if (uri.length > 200) throw Error("The metadata link is too long.");
  const duration = durationSeconds(input.minutes);
  if (duration < config.minDuration || duration > config.maxDuration)
    throw Error("The selected window is outside the current protocol limits.");
  const capBps = Number(input.capBps);
  if (
    !Number.isInteger(capBps) ||
    capBps < config.minCapBps ||
    capBps > config.maxCapBps
  )
    throw Error("The wallet cap is outside current protocol limits.");
  return { name, symbol, uri, duration, capBps, creatorFeeBps: 0 };
}
export async function prepare(input) {
  const wallet = String(address(input.wallet)),
    state = await readiness();
  if (state.stale || !state.verified || !state.writesEnabled)
    throw Error(
      state.reason || "Wallet actions are paused for release verification.",
    );
  let ixs = [],
    book = null,
    offerAddress = null,
    details = {},
    ephemeralMint = null;
  const action = input.action;
  if (action === "create") {
    if (!state.filingEnabled)
      throw Error(state.reason || "New launch windows are paused.");
    const terms = validateTerms(input, state.config);
    const p = await fileIx(wallet, state.config, terms);
    offerAddress = p.offering;
    ixs.push(p.ix);
    const initial = raw(input.initialDeposit || "0");
    if (initial > 0n) {
      const { TOKEN } = await import("./constants.mjs");
      ixs.push(
        await commitIx(
          wallet,
          {
            address: p.offering,
            isNative: true,
            quoteMint: SOL,
            quoteTokenProgram: TOKEN,
          },
          initial,
        ),
      );
    }
    details = {
      ...terms,
      initialDeposit: units(initial),
      creationBudget: "0.02",
      refunds: false,
      capPercent: String(terms.capBps / 100),
    };
  } else {
    book = await offering(String(address(input.offering)));
    offerAddress = book.address;
    if (!book.isNative || book.quoteMint !== SOL)
      throw Error("Only SOL-quoted pools are supported in this release.");
    if (action === "deposit") {
      if (book.status !== "open" || book.closesAt <= Date.now() / 1000)
        throw Error(
          "This deposit window has closed. Refresh to view its launch status.",
        );
      const amount = raw(input.amount);
      if (amount <= 0n || amount > 100000000000n)
        throw Error("Use a deposit above zero and at most 100 SOL.");
      ixs.push(await commitIx(wallet, book, amount));
      details = {
        amount: units(amount),
        name: book.name,
        symbol: book.symbol,
        capPercent: String(book.capBps / 100),
        refunds: false,
      };
    } else if (action === "claim") {
      ixs.push(await claimIx(wallet, wallet, book));
      details = {
        name: book.name,
        symbol: book.symbol,
        recipient: wallet,
        mint: book.mint,
      };
    } else if (action === "launch") {
      if (book.status !== "open" || book.closesAt > Date.now() / 1000)
        throw Error("The pool is not ready for finalization.");
      ephemeralMint = String(address(input.mint));
      const connection = new legacy.web3.Connection(
        process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
        { commitment: "finalized", disableRetryOnRateLimit: true },
      );
      const global = await new legacy.pump.OnlinePumpSdk(
        connection,
      ).fetchGlobal();
      ixs.push(
        await launchIx(wallet, ephemeralMint, book, state.config, {
          feeRecipient: global.feeRecipient.toBase58(),
          buybackFeeRecipients: global.buybackFeeRecipients.map((k) =>
            k.toBase58(),
          ),
        }),
      );
      details = {
        name: book.name,
        symbol: book.symbol,
        poolSol: units(book.raised),
        mint: ephemeralMint,
        creationBudget: units(book.deposit),
        finalizer: wallet,
      };
    } else throw Error("Unknown wallet action.");
  }
  return {
    action,
    wallet,
    program: PROGRAM,
    network: "mainnet-beta",
    offering: offerAddress,
    book,
    details,
    ixs: ixs.map(pack),
    lookupTable: state.lookupTable,
    issuedAt: Date.now(),
    ephemeralMint,
    notice:
      "Enigma v1 program-controlled escrow. Deposits are final; wallet caps do not prevent multi-wallet participation.",
  };
}
