"use client";

import type { Connections } from "@/core/embeddings";
import { ConnectionsPanel } from "@/core/ui/ConnectionsPanel";
import { ProjectSuggestionCard } from "@/core/ui/ProjectSuggestionCard";
import { setIdeaProject } from "../actions";

export function IdeaConnections({
  ideaId,
  connections,
}: {
  ideaId: string;
  connections: Connections;
}) {
  const { projectSuggestion, related } = connections;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {projectSuggestion && (
        <ProjectSuggestionCard
          suggestion={projectSuggestion}
          onLink={(projectId) => setIdeaProject(ideaId, projectId)}
        />
      )}
      <ConnectionsPanel related={related} />
    </div>
  );
}
