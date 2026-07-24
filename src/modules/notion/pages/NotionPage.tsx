import { desc, sql } from "drizzle-orm";
import { db } from "@/core/db/client";
import { connectedWorkspaces } from "../sync";
import { notionPages } from "../schema";
import { NotionConsole } from "../components/NotionConsole";

export async function NotionPage() {
  const workspaces = await connectedWorkspaces();

  const [pages, countRows] = await Promise.all([
    db
      .select({
        id: notionPages.id,
        title: notionPages.title,
        url: notionPages.url,
        workspace: notionPages.workspace,
      })
      .from(notionPages)
      .orderBy(desc(notionPages.lastEdited))
      .limit(300),
    db
      .select({ workspace: notionPages.workspace, n: sql<number>`count(*)` })
      .from(notionPages)
      .groupBy(notionPages.workspace),
  ]);

  const counts: Record<string, number> = {};
  for (const r of countRows) counts[r.workspace ?? ""] = Number(r.n);

  return (
    <NotionConsole workspaces={workspaces} counts={counts} pages={pages} />
  );
}
