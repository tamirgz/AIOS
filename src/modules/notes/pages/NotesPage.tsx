import { listNotes } from "../actions";
import { NotesGrid } from "../components/NotesGrid";

export async function NotesPage() {
  const notes = await listNotes();
  return <NotesGrid notes={notes} />;
}
