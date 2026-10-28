import { getBase58Encoder } from "@solana/kit";
import {
  V2_PROGRAM,
  LAUNCHLAB,
  PLATFORM,
  STONK,
  discriminator,
} from "./stonk-protocol.mjs";
const bytes = getBase58Encoder();
async function matches(ix, name) {
  try {
    const d = bytes.encode(ix.data || "");
    const expect = await discriminator("global:" + name);
    return expect.every((v, i) => d[i] === v);
  } catch {
    return false;
  }
}
export async function verifyLaunchReceipt(tx, book, program = V2_PROGRAM) {
  if (
    !tx?.meta ||
    tx.meta.err !== null ||
    book.status !== "launched" ||
    book.version !== 2
  )
    return false;
  const top = tx.transaction?.message?.instructions || [];
  for (let index = 0; index < top.length; index++) {
    const ix = top[index];
    if (
      ix.programId !== program ||
      !(await matches(ix, "launch")) ||
      ix.accounts?.[1] !== book.mint ||
      ix.accounts?.[2] !== book.address
    )
      continue;
    const inner =
      (tx.meta.innerInstructions || []).find((g) => g.index === index)
        ?.instructions || [];
    let created = false,
      bought = false;
    for (const i of inner) {
      if (
        i.programId !== LAUNCHLAB ||
        !i.accounts?.includes(book.mint) ||
        !i.accounts?.includes(PLATFORM) ||
        !i.accounts?.includes(STONK)
      )
        continue;
      created ||= await matches(i, "initialize_with_token2022");
      bought ||= await matches(i, "buy_exact_in");
    }
    if (created && bought) return true;
  }
  return false;
}
