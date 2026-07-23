import { getProjectCockpit } from "../queries";
import { ProjectGrid } from "../components/ProjectGrid";

export async function ProjectsPage() {
  const projects = await getProjectCockpit();
  return <ProjectGrid projects={projects} />;
}
