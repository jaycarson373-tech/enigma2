// Wallet-owned initial deployment tooling. Always 404 in production.
import { readFile } from "node:fs/promises";
import { address } from "@solana/kit";
import { sameOrigin } from "@/lib/http.mjs";
import { rpc, cached, stonkTerms } from "@/lib/server.mjs";
import {
  assertArtifact,
  releaseIdentity,
  spendPlan,
  releaseStageInstructions,
} from "@/lib/release-v2-flow.mjs";
import { verifyReleaseWire } from "@/lib/release-wire.mjs";
import { enigma2Release } from "@/lib/enigma2-release.mjs";
export const runtime = "nodejs";
export const maxDuration = 30;
async function context(wallet: string) {
  const code = new Uint8Array(
    await readFile(process.cwd() + "/" + enigma2Release.artifact),
  );
  await assertArtifact(code);
  if (
    (await rpc("getGenesisHash")) !==
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
  )
    throw Error("Wrong network");
  const inputs = await cached("local-v2-release", 15000, async () => {
    const rent: Record<string, string> = {};
    for (const [k, n] of Object.entries({
      program: 36,
      programData: 45 + code.length,
      buffer: 37 + code.length,
      config: 64,
    }))
      rent[k] = String(
        await rpc("getMinimumBalanceForRentExemption", [
          n,
          { commitment: "finalized" },
        ]),
      );
    await stonkTerms();
    return { rent };
  });
  if (inputs.stale) throw Error("Stale release inputs");
  return { code, identity: await releaseIdentity(wallet), ...inputs };
}
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  try {
    const wallet = String(
        address(new URL(req.url).searchParams.get("wallet") || ""),
      ),
      c = await context(wallet);
    return Response.json(
      {
        ...c,
        code: Buffer.from(c.code).toString("base64"),
        balance: String(
          (await rpc("getBalance", [wallet, { commitment: "finalized" }]))
            .value,
        ),
        cost: spendPlan(c.rent),
        cluster: "mainnet-beta",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Openbell v2 release inputs could not be verified. No payment was requested.",
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
        null,
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
          "The exact Openbell v2 deployment stage could not be verified. Recover the saved transaction before requesting another payment.",
      },
      { status: 400 },
    );
  }
}
