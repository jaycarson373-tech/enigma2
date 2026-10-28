// Funded acceptance is verified from finalized receipts, never an activation flag alone.
import { createStonkProtocol, discriminator } from "./stonk-protocol.mjs";
import { verifyLaunchReceipt } from "./stonk-receipt.mjs";
import { getBase58Encoder } from "@solana/kit";
const encoding = getBase58Encoder();
export async function verifyAcceptance(read, release) {
  const e = release.acceptance;
  if (
    !e?.offering ||
    !e.mint ||
    !e.creator ||
    !Array.isArray(e.claims) ||
    e.claims.length < 2 ||
    !e.launchSignature
  )
    throw Error("Funded acceptance receipts are missing.");
  const signatures = [e.launchSignature, ...e.claims.map((c) => c.signature)];
  if (
    new Set(signatures).size !== signatures.length ||
    new Set(e.claims.map((c) => c.beneficiary)).size < 2
  )
    throw Error("Acceptance signatures or beneficiaries are duplicated.");
  const client = createStonkProtocol(release.program);
  const book = await client.decodeOffering(
    (
      await read("getAccountInfo", [
        e.offering,
        { encoding: "base64", commitment: "finalized" },
      ])
    ).value,
    e.offering,
  );
  if (
    book.status !== "launched" ||
    book.creator !== e.creator ||
    book.mint !== e.mint ||
    book.backers < 2
  )
    throw Error("Acceptance offering identity mismatch.");
  const fetchTx = (signature) =>
    read("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      },
    ]);
  if (
    !(await verifyLaunchReceipt(
      await fetchTx(e.launchSignature),
      book,
      release.program,
    ))
  )
    throw Error("The funded atomic Stonk launch receipt did not verify.");
  const disc = await discriminator("global:claim");
  for (const c of e.claims) {
    const tx = await fetchTx(c.signature);
    if (tx?.meta?.err !== null)
      throw Error("An acceptance claim did not finalize successfully.");
    const expectedPosition = await client.positionAddress(
      e.offering,
      c.beneficiary,
    );
    const claim = (tx.transaction?.message?.instructions || []).some((ix) => {
      if (
        ix.programId !== release.program ||
        ix.accounts?.[1] !== c.beneficiary ||
        ix.accounts?.[2] !== e.offering ||
        ix.accounts?.[3] !== expectedPosition ||
        ix.accounts?.[5] !== e.mint
      )
        return false;
      try {
        const bytes = encoding.encode(ix.data || "");
        return disc.every((v, i) => bytes[i] === v);
      } catch {
        return false;
      }
    });
    if (!claim)
      throw Error(
        "An acceptance claim targets the wrong position or beneficiary.",
      );
    const amounts = (rows) =>
      new Map(
        (rows || [])
          .filter((b) => b.mint === e.mint && b.owner === c.beneficiary)
          .map((b) => [b.accountIndex, BigInt(b.uiTokenAmount.amount)]),
      );
    const before = amounts(tx.meta.preTokenBalances),
      after = amounts(tx.meta.postTokenBalances);
    if (
      ![...after].some(([index, amount]) => amount > (before.get(index) || 0n))
    )
      throw Error(
        "An acceptance claim did not deliver tokens to its beneficiary.",
      );
  }
  return true;
}
