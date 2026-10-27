import { prepare } from "@/lib/prepare.mjs";
import { body, sameOrigin, publicError } from "@/lib/http.mjs";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  try {
    return Response.json(await prepare(await body(req)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return Response.json(
      {
        error:
          publicError(e,"Could not prepare this action. Nothing was submitted."),
      },
      { status: 400 },
    );
  }
}
