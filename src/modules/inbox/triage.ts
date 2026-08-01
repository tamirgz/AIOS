import { eq } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import type { ModuleJob } from "@/core/modules/types.server";
import { resolveRoute } from "@/core/ai/routing";
import { inboxItems } from "./schema";

const TRIAGE_TOOLS = [
  "tasks.create",
  "notes.create",
  "knowledge.capture",
  "ideas.capture",
  "calendar.createEvent",
];

/** Map the tool the triage used → a destination label + link to the new item. */
function routeFor(
  tool: string,
  result: unknown,
): { kind: string; label: string; href: string } | null {
  const r = (result ?? {}) as {
    created?: { id?: string };
    captured?: { id?: string };
    id?: string;
  };
  const id = r.created?.id ?? r.captured?.id ?? r.id;
  switch (tool) {
    case "tasks.create":
      return { kind: "task", label: "Task", href: "/m/tasks" };
    case "notes.create":
      return { kind: "note", label: "Note", href: id ? `/m/notes/${id}` : "/m/notes" };
    case "knowledge.capture":
      return { kind: "knowledge", label: "Knowledge", href: id ? `/m/knowledge/${id}` : "/m/knowledge" };
    case "ideas.capture":
      return { kind: "idea", label: "Idea", href: id ? `/m/ideas/${id}` : "/m/ideas" };
    case "calendar.createEvent":
      return { kind: "event", label: "Event", href: "/m/calendar" };
    default:
      return null;
  }
}

export async function triageInboxItem(itemId: string): Promise<void> {
  const [item] = await db
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.id, itemId));
  if (!item || item.status === "triaged") return;

  const set = async (patch: Record<string, unknown>) => {
    await db.update(inboxItems).set(patch).where(eq(inboxItems.id, itemId));
    await sql.notify("inbox_changed", itemId);
  };

  try {
    await set({ status: "triaging", error: null });
    const route = await resolveRoute("inbox.triage");
    const { renderMemoryContext } = await import("@/core/memory");
    // Lazy import — tool-registry ↔ module manifests would otherwise cycle at
    // module-evaluation time.
    const { getToolsByNames } = await import("@/core/ai/tool-registry");

    let finalText = "";
    let usedTool: string | null = null;
    let toolResult: unknown = null;
    for await (const event of route.provider.run({
      system: [
        "You are the inbox triage of AIOS, the user's personal AI operating system.",
        "Route the captured input into the right place using EXACTLY ONE tool (or none if it is noise):",
        "- actionable to-do → tasks.create (extract a clean imperative title; set priority/dueAt if implied)",
        "- URL/repo/video/quote worth keeping → knowledge.capture (pass the input through; add a note with your read of why it matters)",
        "- a product/business/feature idea or 'what if…' concept → ideas.capture",
        "- longer thought or journal-style note → notes.create (give it a real title)",
        "- something happening at a date/time → calendar.createEvent",
        "Then answer with ONE short sentence describing what you did.",
        `Current date-time: ${new Date().toISOString()}`,
        "",
        await renderMemoryContext(),
      ].join("\n"),
      messages: [{ role: "user", content: `Captured input:\n${item.input}` }],
      tools: getToolsByNames(TRIAGE_TOOLS),
      toolCtx: { db },
      model: route.model,
      maxTurns: 6,
    })) {
      if (event.type === "done") finalText = event.text;
      if (event.type === "error") throw new Error(event.message);
      // Remember the routing tool + its result (id of the created item).
      if (event.type === "tool_call") usedTool = event.name;
      if (event.type === "tool_result") toolResult = event.result;
    }

    const dest = usedTool ? routeFor(usedTool, toolResult) : null;
    await set({
      status: "triaged",
      triage: {
        summary: finalText.slice(0, 500) || "routed",
        ...(dest ? { route: dest } : {}),
      },
    });

    // Slack-captured items get an in-thread confirmation of how/where they
    // were filed. No-op for manual captures; never breaks triage.
    if (item.source?.startsWith("slack:")) {
      const r = (toolResult ?? {}) as {
        created?: { id?: string };
        captured?: { id?: string };
        id?: string;
      };
      const { confirmSlackCapture } = await import("./slack-capture");
      await confirmSlackCapture({
        source: item.source,
        input: item.input,
        summary: finalText,
        route: dest,
        createdId: r.created?.id ?? r.captured?.id ?? r.id ?? null,
      }).catch(() => {});
    }
  } catch (e) {
    await set({ status: "error", error: String(e).slice(0, 400) });
  }
}

export const inboxJobs: ModuleJob[] = [
  { channel: "inbox_triage", handle: (payload) => triageInboxItem(payload) },
];
