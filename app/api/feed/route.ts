import { feed } from "@/lib/server.mjs";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET() {
  try {
    return Response.json(await feed(), {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch {
    return Response.json(
      { error: "Launch data is refreshing. Please retry." },
      { status: 503 },
    );
  }
}
