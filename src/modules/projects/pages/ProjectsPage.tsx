import { getProjectsWithTaskCounts } from "../queries";
import { ProjectGrid } from "../components/ProjectGrid";

export async function ProjectsPage() {
  const projects = await getProjectsWithTaskCounts();
  return <ProjectGrid projects={projects} />;
}
