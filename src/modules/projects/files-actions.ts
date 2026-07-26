"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sql } from "@/core/db/client";
import { projectFiles } from "./schema";

// Kept in Postgres (see schema.ts) — a generous but bounded cap so a single
// attachment can't blow up the row/backup size.
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export async function listProjectFiles(projectId: string) {
  return db
    .select({
      id: projectFiles.id,
      filename: projectFiles.filename,
      mimeType: projectFiles.mimeType,
      sizeBytes: projectFiles.sizeBytes,
      status: projectFiles.status,
      statusDetail: projectFiles.statusDetail,
      createdAt: projectFiles.createdAt,
    })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId))
    .orderBy(projectFiles.createdAt);
}

/**
 * Upload one or more files to a project. Stores the bytes immediately (so the
 * UI can show them right away) and queues each for text extraction in the
 * worker — status starts "processing" and the pipeline flips it to
 * ready/unsupported/error.
 */
export async function uploadProjectFiles(projectId: string, formData: FormData) {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const results: { filename: string; ok: boolean; error?: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({
        filename: file.name,
        ok: false,
        error: `too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 20MB limit)`,
      });
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const [row] = await db
      .insert(projectFiles)
      .values({
        projectId,
        filename: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        content: buf,
      })
      .returning({ id: projectFiles.id });
    await sql.notify("project_file_ingest", row.id);
    await sql.notify("project_files_changed", row.id);
    results.push({ filename: file.name, ok: true });
  }

  revalidatePath(`/m/projects/${projectId}`);
  return results;
}

export async function deleteProjectFile(id: string, projectId: string) {
  await db.delete(projectFiles).where(eq(projectFiles.id, id));
  await sql.notify("project_files_changed", id);
  revalidatePath(`/m/projects/${projectId}`);
}

/** Called from deleteProject — app-level cascade (no DB FK, per codebase convention). */
export async function deleteProjectFilesFor(projectId: string) {
  await db.delete(projectFiles).where(eq(projectFiles.projectId, projectId));
}
