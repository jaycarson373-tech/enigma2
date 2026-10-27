import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  compressTransactionMessageUsingAddressLookupTables,
  getBase64EncodedWireTransaction,
  getBase64Decoder,
  getSignatureFromTransaction,
  assertIsTransactionWithinSizeLimit,
  partiallySignTransaction,
  isFullySignedTransaction,
  type TransactionSigner,
  type Transaction,
} from "@solana/kit";
import { bytes64, decodeOffering } from "./protocol.mjs";
import { PROGRAM } from "./constants.mjs";
import { requireSimulation, requireLamports, requireNetworkFee } from "./simulation.mjs";
export type Pending = {
  wallet: string;
  signature: string;
  wire: string;
  lastValid: string;
  action: string;
  offering: string;
  mint?: string;
  state: string;
};
export const storageKey = (wallet: string) =>
  `enigma:mainnet:${PROGRAM}:${wallet}`;
export const loadPending = (wallet: string): Pending | null => {
  try {
    const p = JSON.parse(localStorage.getItem(storageKey(wallet)) || "null");
    return p?.wallet === wallet ? p : null;
  } catch {
    return null;
  }
};
const save = (p: Pending) =>
  localStorage.setItem(storageKey(p.wallet), JSON.stringify(p));
export async function rpcCall(method: string, params: any[] = []) {
  const r = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const b = await r.json();
  if (b.error) throw Error(b.error.message);
  return b.result;
}
const terminal = (state: string) =>
  ["finalized", "effect-verified", "failed", "expired"].includes(state);
export async function reconcile(p: Pending) {
  const s = (
    await rpcCall("getSignatureStatuses", [
      [p.signature],
      { searchTransactionHistory: true },
    ])
  ).value[0];
  if (s?.err) p.state = "failed";
  else if (s?.confirmationStatus === "finalized") p.state = "finalized";
  else if (s) p.state = "confirming";
  else {
    const height = await rpcCall("getBlockHeight", [
      { commitment: "finalized" },
    ]);
    if (BigInt(height) > BigInt(p.lastValid)) {
      // A missing historical status does not permit replay of a monetary action.
      if (["deposit", "buy", "sell", "claim"].includes(p.action)) {
        p.state = "history-check";
        save(p);
        return p;
      }
      const a = p.offering
        ? (
            await rpcCall("getAccountInfo", [
              p.offering,
              { encoding: "base64", commitment: "finalized" },
            ])
          ).value
        : null;
      if (a) {
        const o = await decodeOffering(a, p.offering);
        if (
          (p.action === "create" && o.creator === p.wallet) ||
          (p.action === "launch" &&
            o.status === "launched" &&
            o.mint === p.mint)
        )
          p.state = "effect-verified";
        else p.state = "expired";
      } else p.state = "expired";
    } else p.state = "signed";
  }
  save(p);
  return p;
}
export async function prepareWalletTransaction(
  signer: TransactionSigner,
  plan: any,
  mintSigner?: any,
) {
  if (Date.now() - plan.issuedAt > 30000)
    throw Error("This quote expired. Refresh the review.");
  const block = (
    await rpcCall("getLatestBlockhash", [{ commitment: "confirmed" }])
  ).value;
  const ixs = plan.ixs.map((i: any) => ({
    ...i,
    programAddress: address(i.programAddress),
    accounts: i.accounts.map((a: any) => ({
      ...a,
      address: address(a.address),
    })),
    data: bytes64(i.data),
  }));
  const compute = {
    programAddress: address("ComputeBudget111111111111111111111111111111"),
    accounts: [],
    data: new Uint8Array([2, 192, 92, 21, 0]),
  }; // 1,400,000 CU; no unbounded priority tip.
  let message = appendTransactionMessageInstructions(
    [compute, ...ixs],
    setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: block.blockhash,
        lastValidBlockHeight: BigInt(block.lastValidBlockHeight),
      },
      setTransactionMessageFeePayerSigner(
        signer,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );
  const tables: any = {
    [plan.lookupTable.address]: plan.lookupTable.addresses.map((a: string) =>
      address(a),
    ),
  };
  message = compressTransactionMessageUsingAddressLookupTables(
    message,
    tables,
  ) as typeof message;
  let unsigned = compileTransaction(message);
  assertIsTransactionWithinSizeLimit(unsigned);
  if (mintSigner)
    unsigned = await partiallySignTransaction([mintSigner.keyPair], unsigned);
  const wire = getBase64EncodedWireTransaction(unsigned);
  const simulated = await rpcCall("simulateTransaction", [
    wire,
    {
      encoding: "base64",
      sigVerify: false,
      commitment: "confirmed",
      accounts: plan.offering
        ? { encoding: "base64", addresses: [plan.offering, plan.wallet] }
        : undefined,
    },
  ]);
  requireSimulation(simulated);
  let simulatedBook = null;
  const a = simulated.value.accounts?.[0];
  if (a)
    try {
      simulatedBook = await decodeOffering(a, plan.offering);
    } catch {}
  const balanceBefore=requireLamports((await rpcCall("getBalance",[plan.wallet,{commitment:"confirmed"}])).value);
  const simulatedBalance=simulated.value.accounts?.[1]?.lamports;
  const debit=simulatedBalance==null?null:balanceBefore-requireLamports(simulatedBalance,"Simulated balance");
  const fee = (
    await rpcCall("getFeeForMessage", [
      getBase64Decoder().decode(unsigned.messageBytes),
      { commitment: "confirmed" },
    ])
  ).value;
  requireNetworkFee(fee);
  return {
    unsigned,
    block,
    simulatedAt: Date.now(),
    networkFee: String(fee),
    simulatedDebit:debit==null?null:String(debit),
    compute: simulated.value.unitsConsumed,
    simulatedBook,
    wireBytes: atob(wire).length,
  };
}
export async function signAndSend(
  signer: TransactionSigner,
  prepared: any,
  plan: any,
  currentWallet: () => string | undefined,
) {
  const previous = loadPending(plan.wallet);
  if (previous && !terminal(previous.state)) {
    const p = await reconcile(previous);
    if (!terminal(p.state))
      throw Error(
        "Your original transaction is still being verified. Recover it before another payment.",
      );
    if (["finalized", "effect-verified"].includes(p.state))
      throw Error(
        "Your earlier action completed. Refresh its current state before another review.",
      );
  }
  if (currentWallet() !== plan.wallet)
    throw Error("The wallet changed. Review again with the connected wallet.");
  if (Date.now() - prepared.simulatedAt > 30000)
    throw Error("This review expired. Refresh the quote.");
  const height = await rpcCall("getBlockHeight", [{ commitment: "confirmed" }]);
  if (BigInt(height) >= BigInt(prepared.block.lastValidBlockHeight) - 10n)
    throw Error("Transaction lifetime ended. Refresh the review.");
  let signed: Transaction;
  if ("modifyAndSignTransactions" in signer) {
    [signed] = await signer.modifyAndSignTransactions([prepared.unsigned]);
  } else if ("signTransactions" in signer) {
    const [signatures] = await signer.signTransactions([prepared.unsigned]);
    signed = {
      ...prepared.unsigned,
      signatures: { ...prepared.unsigned.signatures, ...signatures },
    };
  } else
    throw Error("Use a wallet that returns signed transactions for recovery.");
  if (
    currentWallet() !== plan.wallet ||
    signed.messageBytes.length !== prepared.unsigned.messageBytes.length ||
    !signed.messageBytes.every(
      (b, i) => b === prepared.unsigned.messageBytes[i],
    )
  )
    throw Error(
      "The wallet changed the reviewed action. Nothing was submitted.",
    );
  if (!isFullySignedTransaction(signed))
    throw Error("A required signature is missing. Nothing was submitted.");
  const p: Pending = {
    wallet: plan.wallet,
    signature: getSignatureFromTransaction(signed),
    wire: getBase64EncodedWireTransaction(signed),
    lastValid: String(prepared.block.lastValidBlockHeight),
    action: plan.action,
    offering: plan.offering,
    mint: plan.ephemeralMint,
    state: "signed",
  };
  save(p);
  try {
    await rpcCall("sendTransaction", [
      p.wire,
      { encoding: "base64", skipPreflight: false, maxRetries: 2 },
    ]);
    p.state = "confirming";
    save(p);
    return await reconcile(p);
  } catch {
    p.state = "unknown";
    save(p);
    return p;
  }
}
export async function retryOriginal(p: Pending) {
  p = await reconcile(p);
  if (p.state === "signed")
    await rpcCall("sendTransaction", [
      p.wire,
      { encoding: "base64", skipPreflight: false, maxRetries: 2 },
    ]);
  return reconcile(p);
}
