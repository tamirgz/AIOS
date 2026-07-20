import { listNotes } from "../actions";
import { NotesGrid } from "../components/NotesGrid";

export async function NotesPage() {
  const { listProjects } = await import("@/modules/projects/actions");
  const [notes, projects] = await Promise.all([
    listNotes(),
    listProjects().catch(() => []),
  ]);
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  return <NotesGrid notes={notes} projectNames={projectNames} />;
}
