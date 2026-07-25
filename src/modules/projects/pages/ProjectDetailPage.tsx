import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ModuleRouteProps } from "@/core/modules/types.server";
import { GlassPanel } from "@/core/ui/GlassPanel";
import { cn } from "@/core/ui/cn";
import type { Task, TaskStatus } from "../../tasks/schema";
import { getProjectCockpitById, getProjectTasks } from "../queries";
import { setProjectGoal, setProjectNextAction } from "../actions";
import { CockpitHeader } from "../components/CockpitHeader";
import { ProjectAttention } from "../components/ProjectAttention";
import { DeleteProjectButton } from "../components/DeleteProjectButton";
import { ProjectTaskQuickAdd } from "../components/ProjectTaskQuickAdd";
import { ProjectNotes } from "../components/ProjectNotes";
import { StatusCycleButton } from "../components/StatusCycleButton";
import { ProjectTitle } from "../components/ProjectTitle";

function lastActiveLabel(d: Date | null): string {
  if (!d) return "no activity";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "active today";
  if (days === 1) return "active yesterday";
  return `active ${days}d ago`;
}

const TASK_GROUPS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "todo", label: "Queue", accent: "var(--color-ion)" },
  { status: "doing", label: "In flight", accent: "var(--color-solar)" },
  { status: "done", label: "Landed", accent: "var(--color-plasma)" },
];

const PRIORITY_STYLE = {
  high: "text-flare",
  medium: "text-solar",
  low: "text-ink-faint",
} as const;

function TaskRow({ task }: { task: Task }) {
  return (
    <Link
      href="/m/tasks"
      className="glass group flex items-start gap-2 rounded-xl p-3.5 transition hover:bg-white/4"
    >
      <span
        className={cn(
          "mt-1 font-mono text-[9px] uppercase",
          PRIORITY_STYLE[task.priority],
        )}
        title={`${task.priority} priority`}
      >
        ▲
      </span>
      <p
        className={cn(
          "flex-1 text-sm leading-snug transition group-hover:text-ink",
          task.status === "done"
            ? "text-ink-faint line-through"
            : "text-ink-dim",
        )}
      >
        {task.title}
      </p>
    </Link>
  );
}

export async function ProjectDetailPage({ params }: ModuleRouteProps) {
  const [id] = params;
  const project = await getProjectCockpitById(id);

  if (!project) {
    return (
      <GlassPanel className="flex flex-col items-center gap-3 px-8 py-20 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-flare">
          signal lost
        </p>
        <h2 className="font-display text-3xl font-semibold text-ink">
          No project answers at this id
        </h2>
        <Link
          href="/m/projects"
          className="mt-2 rounded-lg border border-plasma/30 px-4 py-2 font-mono text-xs uppercase tracking-widest text-plasma transition hover:bg-plasma/10"
        >
          back to projects
        </Link>
      </GlassPanel>
    );
  }

  const { listNotesForProject } = await import("@/modules/notes/actions");
  const { listAttentionForProject } = await import("@/modules/today/queries");
  const [projectTasks, projectNotes, attention] = await Promise.all([
    getProjectTasks(id),
    listNotesForProject(id).catch(() => []),
    listAttentionForProject(id).catch(() => []),
  ]);
  const done = projectTasks.filter((t) => t.status === "done").length;
  const openAttention = attention.filter((a) => a.status === "open");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/m/projects"
          className="mb-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint transition hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          projects
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <ProjectTitle id={project.id} name={project.name} />
          <StatusCycleButton id={project.id} status={project.status} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            {done}/{projectTasks.length} tasks
          </span>
          <div className="ml-auto">
            <DeleteProjectButton id={project.id} />
          </div>
        </div>
        {project.description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">
            {project.description}
          </p>
        )}
      </header>

      <CockpitHeader
        id={project.id}
        status={project.status}
        goal={project.goal}
        nextAction={project.nextAction}
        health={project.resolvedHealth.health}
        healthReason={project.resolvedHealth.reason}
        healthSource={project.resolvedHealth.source}
        stats={{
          open: project.taskCounts.open,
          done: project.taskCounts.done,
          overdue: project.taskCounts.overdue,
          notes: project.noteCount,
          attention: openAttention.length,
        }}
        lastActive={lastActiveLabel(project.lastActivityAt)}
        setGoal={setProjectGoal}
        setNextAction={setProjectNextAction}
      />

      <ProjectAttention
        items={openAttention.map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          body: a.body,
        }))}
      />

      <ProjectTaskQuickAdd projectId={project.id} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TASK_GROUPS.map((group) => {
          const items = projectTasks.filter((t) => t.status === group.status);
          return (
            <section key={group.status} className="min-h-40">
              <header className="mb-3 flex items-center gap-2 px-1">
                <span className="dot" style={{ color: group.accent }} />
                <h2 className="font-display text-sm font-medium uppercase tracking-[0.2em] text-ink-dim">
                  {group.label}
                </h2>
                <span className="ml-auto font-mono text-xs tabular-nums text-ink-faint">
                  {items.length}
                </span>
              </header>
              <div className="flex flex-col gap-2.5">
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
                {items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/6 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
                    empty
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <ProjectNotes projectId={project.id} notes={projectNotes} />
    </div>
  );
}
