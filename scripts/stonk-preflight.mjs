// Public reads only. No wallet input, signer, persisted launch or broadcast.
import { enigma2Release } from "../lib/enigma2-release.mjs";
import { verifyStonkVenue } from "../lib/stonk-readiness.mjs";

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!response.ok) throw Error("Read-only Stonk verification request failed.");
  return response.json();
}
async function read(method, params = []) {
  if (!["getGenesisHash", "getMultipleAccounts"].includes(method)) throw Error("Only public verification reads are allowed.");
  const body = await json(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (body.error || !("result" in body)) throw Error("Read-only mainnet verification is unavailable.");
  return body.result;
}
try {
  const body = await json("https://www.stonkfun.xyz/api/public/v1/launchlab/pricing?quoteMint=" + enigma2Release.quoteMint);
  if (body.error) throw Error("Stonk pricing is unavailable.");
  console.log(JSON.stringify(await verifyStonkVenue(body.data, read), null, 2));
} catch {
  // Provider errors can contain private RPC URLs; never echo their raw message.
  console.error("Stonk venue verification failed. No signing, submission or activation occurred. Check pricing, finalized account rules and RPC access.");
  process.exitCode = 1;
}
