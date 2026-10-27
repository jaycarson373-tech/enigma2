import { readiness } from "@/lib/server.mjs";
export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json(await readiness(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        verified: false,
        writesEnabled: false,
        filingEnabled: false,
        reason:
          "Protocol verification is refreshing. Wallet actions are temporarily paused.",
      },
      { status: 503 },
    );
  }
}
