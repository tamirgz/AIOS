"use server";

import { revalidatePath } from "next/cache";
import { syncGmail } from "./sync";

/** Pull recent Gmail on demand (button in the UI). */
export async function resyncGmail() {
  const res = await syncGmail();
  revalidatePath("/m/gmail");
  return res;
}
