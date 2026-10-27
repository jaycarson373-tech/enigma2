import { rpc, readiness } from "@/lib/server.mjs";
import { sameOrigin, body, rpcFailureMessage } from "@/lib/http.mjs";
import { validateRequest } from "@/lib/rpc-policy.mjs";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) {
  let method = "", validated = false;
  try {
    if (!sameOrigin(req)) throw Error("Origin rejected");
    const input = await body(req);
    method = input.method;
    const state = ["sendTransaction", "simulateTransaction"].includes(
      input.method,
    )
      ? await readiness()
      : null;
    await validateRequest(input, state);
    validated = true;
    return Response.json(
      {
        jsonrpc: "2.0",
        id: input.id ?? 1,
        result: await rpc(input.method, input.params),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32000,
          message: rpcFailureMessage(method, validated, error?.message === "Wallet actions are paused"),
        },
      },
      { status: 400 },
    );
  }
}
