import type { ModuleServerManifest } from "@/core/modules/types.server";
import { notes } from "./schema";
import { noteTools } from "./tools";
import { NotesPage } from "./pages/NotesPage";
import { NoteDetailPage } from "./pages/NoteDetailPage";
import { RecentNotesWidget } from "./widgets/RecentNotesWidget";

export const notesServerManifest: ModuleServerManifest = {
  id: "notes",
  routes: {
    "": NotesPage,
    "[id]": NoteDetailPage,
  },
  widgets: [
    {
      id: "recent-notes",
      title: "Recent notes",
      size: "md",
      component: RecentNotesWidget,
    },
  ],
  schema: { notes },
  aiTools: noteTools,
  agentTemplates: [],
};
