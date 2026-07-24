"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/core/db/client";
import { setSetting } from "@/core/app-settings";
import { NOTION_TOKEN_KEY, syncNotion } from "./sync";

/** Save the Notion integration token and kick a first sync. */
export async function setNotionToken(token: string) {
  await setSetting(NOTION_TOKEN_KEY, token.trim());
  const res = await syncNotion();
  revalidatePath("/m/notion");
  return res;
}

export async function resyncNotion() {
  const res = await syncNotion();
  revalidatePath("/m/notion");
  return res;
}

export async function disconnectNotion() {
  await setSetting(NOTION_TOKEN_KEY, "");
  await sql.notify("notion_changed", "");
  revalidatePath("/m/notion");
}
