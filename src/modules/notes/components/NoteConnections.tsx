"use client";

import type { Connections } from "@/core/embeddings";
import { ConnectionsPanel } from "@/core/ui/ConnectionsPanel";
import { ProjectSuggestionCard } from "@/core/ui/ProjectSuggestionCard";
import { setNoteProjects } from "../actions";

export function NoteConnections({
  noteId,
  currentRefs,
  connections,
}: {
  noteId: string;
  currentRefs: string[];
  connections: Connections;
}) {
  const { projectSuggestion, related } = connections;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {projectSuggestion && (
        <ProjectSuggestionCard
          suggestion={projectSuggestion}
          // Multi-filing: accepting a suggestion ADDS the project, keeping any
          // the note is already filed under.
          onLink={(projectId) =>
            setNoteProjects(noteId, [
              ...currentRefs,
              `projects:${projectId}`,
            ])
          }
        />
      )}
      <ConnectionsPanel related={related} />
    </div>
  );
}
