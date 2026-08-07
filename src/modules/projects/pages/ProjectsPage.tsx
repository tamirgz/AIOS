import { getProjectCockpit } from "../queries";
import { getProjectCategoryOrder } from "../actions";
import { ProjectGrid } from "../components/ProjectGrid";

export async function ProjectsPage() {
  const [projects, categoryOrder] = await Promise.all([
    getProjectCockpit(),
    getProjectCategoryOrder(),
  ]);
  return <ProjectGrid projects={projects} categoryOrder={categoryOrder} />;
}
