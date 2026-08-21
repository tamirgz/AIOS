import { db } from "@/core/db/client";
import { getAllTools } from "@/core/ai/tool-registry";
import { ensureDefaultRoutes, resolveRoute } from "@/core/ai/routing";
import type { ChatMessage } from "@/core/ai/provider";
import { modules } from "@/modules/registry";

export const maxDuration = 300;

async function systemPrompt() {
  const { renderMemoryContext } = await import("@/core/memory");
  const moduleList = modules.map((m) => m.id).join(", ");
  return [
    "You are the AI core of apOS — the user's Agentic Personalized Operating System.",
    `Installed modules: ${moduleList}.`,
    "Use the available tools to read and change the user's data when asked.",
    "Only call a mutating tool (create, update, delete, send, notify) when the user explicitly asks to change something. For a question, answer from read-only tools — never create, modify, or send anything as a side effect.",
    "Be concise: answer in a few sentences. After acting, state plainly what you did.",
    `Current date-time: ${new Date().toISOString()}`,
    "",
    await renderMemoryContext(),
  ].join("\n");
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  if (!messages?.length) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  await ensureDefaultRoutes();
  const route = await resolveRoute("chat");
  // Claude handles the full registry well (and the SDK prompt-caches tool
  // definitions). Small local models get a lean, high-value subset — fewer
  // definitions means less context burned and better tool selection.
  const LEAN_TOOLS = new Set([
    "search.everything",
    "memory.update",
    "memory.remember",
    "memory.recall",
    "tasks.create",
    "tasks.list",
    "tasks.setStatus",
    "notes.create",
    "notes.search",
    "knowledge.capture",
    "knowledge.search",
    "calendar.agenda",
    "ideas.capture",
    "notify.send",
  ]);
  // Local models (Ollama, or MLX via LM Studio) get a lean, high-value subset —
  // fewer tool definitions means far less context burned (the full registry is
  // ~10k tokens) and better tool selection. Claude handles the full set.
  // When iSentry is connected, expose the read-only portfolio tools to the lean
  // local-chat subset too — so you can ask about your portfolio on a local model
  // (they gate on config, so they're inert/absent otherwise).
  const { isentryConfigured } = await import("@/modules/investments/db");
  if (isentryConfigured())
    for (const n of [
      "portfolio.summary",
      "portfolio.positions",
      "portfolio.performance",
      "portfolio.transactions",
      "portfolio.savings",
    ])
      LEAN_TOOLS.add(n);
  const isLocal = route.providerId === "ollama" || route.providerId === "mlx";
  const tools = isLocal
    ? getAllTools().filter((t) => LEAN_TOOLS.has(t.name))
    : getAllTools();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({
        type: "meta",
        provider: route.providerId,
        model: route.model,
      });
      try {
        for await (const event of route.provider.run({
          system: await systemPrompt(),
          messages,
          tools,
          toolCtx: { db },
          model: route.model,
          // Interactive: keep it snappy. Measured on the local chat model,
          // reasoning adds latency (up to 6.7×) with no thinking benefit and
          // occasional spurious tool calls — so force it off regardless of
          // provider. Agentic memory work (consolidation) keeps reasoning on.
          reasoning: "none",
          signal: req.signal,
        })) {
          send(event);
        }
      } catch (e) {
        send({ type: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
