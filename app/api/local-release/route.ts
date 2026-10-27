// Wallet-owned deployment tooling is LOCAL DEVELOPMENT ONLY, unavailable on Vercel.
import { readFile } from "node:fs/promises";
import { sameOrigin } from "@/lib/http.mjs";
import { rpc, cached } from "@/lib/server.mjs";
import { address } from "@solana/kit";
import {
  assertArtifact,
  releaseIdentity,
  spendPlan,
  releaseStageInstructions,
} from "@/lib/release-flow.mjs";
import { verifyReleaseWire } from "@/lib/release-wire.mjs";
import legacy from "@/lib/pump-legacy.cjs";
import { PUMP_GLOBAL } from "@/lib/constants.mjs";
import { assertEnigma2Implemented } from "@/lib/enigma2-release.mjs";
export const runtime = "nodejs";
export const maxDuration = 30;
async function context(wallet: string) {
  assertEnigma2Implemented();
  const code = new Uint8Array(
    await readFile(process.cwd() + "/releases/v1/enigma.so"),
  );
  await assertArtifact(code);
  if (
    (await rpc("getGenesisHash")) !==
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
  )
    throw Error("Wrong network.");
  const common = await cached("local-release-inputs", 15000, async () => {
    const rent: Record<string, string> = {};
    for (const [k, n] of Object.entries({
      program: 36,
      programData: 45 + code.length,
      buffer: 37 + code.length,
      config: 136,
      addressTable: 56 + 32 * 27,
    }))
      rent[k] = String(
        await rpc("getMinimumBalanceForRentExemption", [
          n,
          { commitment: "finalized" },
        ]),
      );
    const a = (
      await rpc("getAccountInfo", [
        PUMP_GLOBAL,
        { encoding: "base64", commitment: "finalized" },
      ])
    ).value;
    if (a?.owner !== "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
      throw Error("Pump configuration identity failed.");
    const global = legacy.pump.PUMP_SDK.decodeGlobal({
      ...a,
      owner: new legacy.web3.PublicKey(a.owner),
      data: Buffer.from(a.data[0], "base64"),
    });
    return {
      rent,
      pumpGlobal: {
        feeRecipient: global.feeRecipient.toBase58(),
        buybackFeeRecipients: global.buybackFeeRecipients.map((k: any) =>
          k.toBase58(),
        ),
      },
    };
  });
  if (common.stale) throw Error("Release input verification is stale.");
  return { code, identity: await releaseIdentity(wallet), ...common };
}
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  try {
    const wallet = String(
        address(new URL(req.url).searchParams.get("wallet") || ""),
      ),
      c = await context(wallet);
    const balance = (
      await rpc("getBalance", [wallet, { commitment: "finalized" }])
    ).value;
    return Response.json(
      {
        ...c,
        code: Buffer.from(c.code).toString("base64"),
        balance: String(balance),
        cost: spendPlan(c.rent),
        cluster: "mainnet-beta",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Deployment inputs could not be verified. No payment was requested.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  if (!sameOrigin(req))
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  try {
    if (Number(req.headers.get("content-length") || 0) > 15000)
      throw Error("Large request");
    const b = await req.json(),
      wallet = String(address(b.wallet));
    const reads = new Set([
      "getLatestBlockhash",
      "getBlockHeight",
      "getAccountInfo",
      "getSignatureStatuses",
      "getFeeForMessage",
      "getBalance",
      "getSlot",
    ]);
    if (reads.has(b.method))
      return Response.json({ result: await rpc(b.method, b.params) });
    if (!["simulateTransaction", "sendTransaction"].includes(b.method))
      throw Error("Unsupported method");
    const c = await context(wallet),
      ixs = await releaseStageInstructions(
        c.identity,
        c.code,
        c.rent,
        c.pumpGlobal,
        b.stage,
      );
    verifyReleaseWire(
      new Uint8Array(Buffer.from(b.params[0], "base64")),
      wallet,
      ixs,
    );
    const options =
      b.method === "simulateTransaction"
        ? { encoding: "base64", sigVerify: false, commitment: "confirmed" }
        : { encoding: "base64", skipPreflight: false, maxRetries: 2 };
    return Response.json({
      result: await rpc(b.method, [b.params[0], options]),
    });
  } catch {
    return Response.json(
      {
        error:
          "The deployment stage could not be verified. The saved transaction is retained; no replacement payment was requested.",
      },
      { status: 400 },
    );
  }
}
