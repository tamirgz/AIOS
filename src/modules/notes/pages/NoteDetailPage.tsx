import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/core/db/client";
import type { ModuleRouteProps } from "@/core/modules/types.server";
import { getConnections } from "@/core/embeddings";
import { notes } from "../schema";
import { NoteEditor } from "../components/NoteEditor";
import { NoteConnections } from "../components/NoteConnections";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function NoteDetailPage({ params }: ModuleRouteProps) {
  const id = params[0];
  const [note] =
    id && UUID_RE.test(id)
      ? await db.select().from(notes).where(eq(notes.id, id)).limit(1)
      : [];

  if (!note) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-white/6 py-16">
        <p className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          note not found
        </p>
        <Link
          href="/m/notes"
          className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:bg-white/5 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          back to notes
        </Link>
      </div>
    );
  }

  const { listProjects } = await import("@/modules/projects/actions");
  const [projectRows, connections] = await Promise.all([
    listProjects().catch(() => []),
    getConnections("note", note.id, {
      currentProjectId: note.projectRef?.split(":")[1] ?? null,
    }),
  ]);
  const projects = projectRows.map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <NoteEditor note={note} projects={projects} />
      <NoteConnections noteId={note.id} connections={connections} />
    </>
  );
}
