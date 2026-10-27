import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
} from "@solana/kit";
export const releaseCompute = {
  programAddress: address("ComputeBudget111111111111111111111111111111"),
  accounts: [],
  data: new Uint8Array([2, 192, 92, 21, 0]),
};
export function compileReleaseTransaction(wallet, ixs, block) {
  return compileTransaction(
    appendTransactionMessageInstructions(
      [releaseCompute, ...ixs],
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: block.blockhash,
          lastValidBlockHeight: BigInt(block.lastValidBlockHeight),
        },
        setTransactionMessageFeePayer(
          address(wallet),
          createTransactionMessage({ version: 0 }),
        ),
      ),
    ),
  );
}
export function verifyReleaseWire(bytes, wallet, ixs) {
  if (bytes.length > 1232)
    throw Error("Deployment transaction exceeds the packet limit.");
  const tx = getTransactionDecoder().decode(bytes),
    m = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (m.addressTableLookups?.length || m.staticAccounts[0] !== wallet)
    throw Error("Deployment wallet or address table changed.");
  const expected = compileReleaseTransaction(wallet, ixs, {
    blockhash: m.lifetimeToken,
    lastValidBlockHeight: 0n,
  });
  if (
    tx.messageBytes.length !== expected.messageBytes.length ||
    !tx.messageBytes.every((b, i) => expected.messageBytes[i] === b)
  )
    throw Error("Deployment transaction differs from the reviewed stage.");
  return tx;
}
