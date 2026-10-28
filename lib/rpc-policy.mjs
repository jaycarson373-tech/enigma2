import {
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
} from "@solana/kit";
import { bytes64, V2_PROGRAM, LAUNCHLAB, ATA } from "./stonk-protocol.mjs";
const allowed = new Set([
  "getLatestBlockhash",
  "getBlockHeight",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getSignatureStatuses",
  "getMinimumBalanceForRentExemption",
  "getFeeForMessage",
  "simulateTransaction",
  "sendTransaction",
]);
export async function validateRequest(input, state) {
  if (!allowed.has(input.method) || !Array.isArray(input.params))
    throw Error("Unsupported request");
  if (!["sendTransaction", "simulateTransaction"].includes(input.method))
    return;
  if (!state.verified || state.stale || !state.writesEnabled)
    throw Error("Wallet actions are paused for Enigma 2 release verification.");
  const wire = bytes64(input.params[0]);
  if (wire.length > 1232) throw Error("Transaction too large");
  const tx = getTransactionDecoder().decode(wire),
    m = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  // Current v2 wires fit without lookup tables. No caller-provided table is accepted.
  if (m.addressTableLookups?.length) throw Error("Unapproved address table");
  let core = false;
  for (const ix of m.instructions) {
    const program = m.staticAccounts[ix.programAddressIndex];
    if (
      ![
        V2_PROGRAM,
        LAUNCHLAB,
        ATA,
        "ComputeBudget111111111111111111111111111111",
      ].includes(program)
    )
      throw Error("Unsupported transaction program");
    if (program === "ComputeBudget111111111111111111111111111111") {
      const d = ix.data;
      if (
        d?.length !== 5 ||
        d[0] !== 2 ||
        new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(1, true) >
          1400000
      )
        throw Error("Unapproved compute fee or limit");
    }
    if ([V2_PROGRAM, LAUNCHLAB].includes(program)) core = true;
  }
  if (!core) throw Error("Not an Enigma 2 action");
  if (
    input.method === "sendTransaction" &&
    Object.values(tx.signatures).some((v) => !v)
  )
    throw Error("Missing transaction signature");
}
