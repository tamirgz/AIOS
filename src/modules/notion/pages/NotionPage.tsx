import { desc } from "drizzle-orm";
import { db } from "@/core/db/client";
import { notionConnected } from "../sync";
import { notionPages } from "../schema";
import { NotionConsole } from "../components/NotionConsole";

export async function NotionPage() {
  const connected = await notionConnected();
  const pages = connected
    ? await db
        .select({
          id: notionPages.id,
          title: notionPages.title,
          url: notionPages.url,
          lastEdited: notionPages.lastEdited,
        })
        .from(notionPages)
        .orderBy(desc(notionPages.lastEdited))
        .limit(200)
    : [];
  return <NotionConsole connected={connected} pages={pages} />;
}
