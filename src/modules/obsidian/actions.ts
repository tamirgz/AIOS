"use server";

import { sql } from "@/core/db/client";

export async function requestVaultSync() {
  await sql.notify("obsidian_sync", "manual");
}
