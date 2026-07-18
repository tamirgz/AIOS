"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import {
  contentItems,
  publishAtNullsLast,
  type ContentKind,
  type ContentStage,
} from "./schema";

export async function listContent() {
  return db
    .select()
    .from(contentItems)
    .orderBy(publishAtNullsLast, asc(contentItems.createdAt));
}

export async function createContent(input: {
  title: string;
  kind?: ContentKind;
  publishAt?: Date | null;
}) {
  const title = input.title.trim();
  if (!title) throw new Error("Content title is required");
  const [row] = await db
    .insert(contentItems)
    .values({
      title,
      kind: input.kind ?? "post",
      publishAt: input.publishAt ?? null,
    })
    .returning();
  revalidatePath("/");
  revalidatePath("/m/content");
  return row;
}

export async function setContentStage(id: string, stage: ContentStage) {
  const [row] = await db
    .update(contentItems)
    .set({ stage, updatedAt: new Date() })
    .where(eq(contentItems.id, id))
    .returning();
  revalidatePath("/");
  revalidatePath("/m/content");
  return row;
}

export async function updateContent(
  id: string,
  patch: Partial<{
    title: string;
    kind: ContentKind;
    notes: string | null;
    publishAt: Date | null;
  }>,
) {
  const [row] = await db
    .update(contentItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(contentItems.id, id))
    .returning();
  revalidatePath("/");
  revalidatePath("/m/content");
  return row;
}

export async function deleteContent(id: string) {
  await db.delete(contentItems).where(eq(contentItems.id, id));
  revalidatePath("/");
  revalidatePath("/m/content");
}
