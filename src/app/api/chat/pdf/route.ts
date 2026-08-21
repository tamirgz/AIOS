import { renderMarkdownReportPdf } from "@/core/pdf/markdownReport";

export const runtime = "nodejs";

/** POST { title, content } → a downloadable PDF report of a chat response. */
export async function POST(req: Request) {
  const { title, content } = (await req.json()) as {
    title?: string;
    content?: string;
  };
  if (!content?.trim())
    return new Response("content required", { status: 400 });

  const heading = title?.trim() || "apOS chat report";
  const pdf = await renderMarkdownReportPdf({
    title: heading,
    body: content,
    subtitle: "chat export",
    createdAt: new Date(),
  });

  const slug =
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "chat";

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="aios-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
