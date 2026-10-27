import {
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
} from "@solana/kit";
import { bytes64 } from "./protocol.mjs";
import { PROGRAM, PUMP, ATA, SYSTEM, LOOKUP_TABLE } from "./constants.mjs";
import { assertEnigma2Implemented } from "./enigma2-release.mjs";
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
  assertEnigma2Implemented();
  if (!state.verified || state.stale || !state.writesEnabled)
    throw Error("Wallet actions are paused");
  const wire = bytes64(input.params[0]);
  if (wire.length > 1232) throw Error("Transaction too large");
  const tx = getTransactionDecoder().decode(wire),
    m = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  const keys = [...m.staticAccounts],
    writable = [],
    readonly = [];
  for (const l of m.addressTableLookups || []) {
    if (l.lookupTableAddress !== LOOKUP_TABLE)
      throw Error("Unapproved address table");
    for (const i of l.writableIndexes || l.writableIndices || [])
      writable.push(state.lookupTable.addresses[i]);
    for (const i of l.readonlyIndexes || l.readonlyIndices || [])
      readonly.push(state.lookupTable.addresses[i]);
  }
  keys.push(...writable, ...readonly);
  let core = false;
  for (const ix of m.instructions) {
    const p = keys[ix.programAddressIndex];
    if (
      ![
        PROGRAM,
        PUMP,
        ATA,
        SYSTEM,
        "ComputeBudget111111111111111111111111111111",
      ].includes(p)
    )
      throw Error("Unsupported transaction program");
    if ([PROGRAM, PUMP].includes(p)) core = true;
  }
  if (!core) throw Error("Not an Enigma action");
  if (
    input.method === "sendTransaction" &&
    Object.values(tx.signatures).some((v) => !v)
  )
    throw Error("Missing transaction signature");
}
