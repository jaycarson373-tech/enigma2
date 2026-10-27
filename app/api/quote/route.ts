import { tradeQuote } from "@/lib/trade.mjs";
import { body, sameOrigin, publicError } from "@/lib/http.mjs";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  try {
    return Response.json(await tradeQuote(await body(req)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return Response.json(
      { error: publicError(e,"A current trade quote could not be prepared. Nothing was submitted.") },
      { status: 400 },
    );
  }
}
