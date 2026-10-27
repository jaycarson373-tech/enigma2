import { portfolio } from "@/lib/server.mjs";
import { address } from "@solana/kit";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    return Response.json(
      await portfolio(
        String(address(new URL(req.url).searchParams.get("wallet") || "")),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "This wallet’s positions could not be refreshed." },
      { status: 503 },
    );
  }
}
