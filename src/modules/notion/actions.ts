"use server";

import { revalidatePath } from "next/cache";
import { addConnection, removeConnection, syncNotion } from "./sync";

/** Add a Notion workspace by its integration token (validates + first sync). */
export async function addNotionWorkspace(token: string) {
  const res = await addConnection(token);
  revalidatePath("/m/notion");
  return res;
}

/** Disconnect one workspace and drop its indexed pages. */
export async function removeNotionWorkspace(workspace: string) {
  await removeConnection(workspace);
  revalidatePath("/m/notion");
}

export async function resyncNotion() {
  const res = await syncNotion();
  revalidatePath("/m/notion");
  return res;
}
