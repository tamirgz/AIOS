import { eq } from "drizzle-orm";
import { db } from "@/core/db/client";
import { charts } from "@/modules/investments/schema";

export const runtime = "nodejs";

/** Serves a viz.chart SVG by id (referenced from markdown image embeds). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(id)) return new Response("bad id", { status: 400 });

  const [row] = await db.select().from(charts).where(eq(charts.id, id));
  if (!row) return new Response("not found", { status: 404 });

  // ?spec=1 → the chart spec (JSON) for the interactive client render.
  if (new URL(req.url).searchParams.get("spec") && row.spec) {
    return Response.json(row.spec, {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  return new Response(row.svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
