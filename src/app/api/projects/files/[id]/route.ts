import { eq } from "drizzle-orm";
import { db } from "@/core/db/client";
import { projectFiles } from "@/modules/projects/schema";

/** Streams an attached file's raw bytes back — the "view/download" link for search hits and the project's file list. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db
    .select({
      filename: projectFiles.filename,
      mimeType: projectFiles.mimeType,
      content: projectFiles.content,
    })
    .from(projectFiles)
    .where(eq(projectFiles.id, id));

  if (!row) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(row.content), {
    headers: {
      "Content-Type": row.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.filename)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
