import { db } from "@/core/db/client";
import { getAllTools } from "@/core/ai/tool-registry";
import { ensureDefaultRoutes, resolveRoute } from "@/core/ai/routing";
import type { ChatMessage } from "@/core/ai/provider";
import { modules } from "@/modules/registry";

export const maxDuration = 300;

function systemPrompt() {
  const moduleList = modules.map((m) => m.id).join(", ");
  return [
    "You are the AI core of AIOS — the user's personal AI operating system.",
    `Installed modules: ${moduleList}.`,
    "Use the available tools to read and change the user's data when asked.",
    "Be concise: answer in a few sentences. After acting, state plainly what you did.",
    `Current date-time: ${new Date().toISOString()}`,
  ].join("\n");
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  if (!messages?.length) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  await ensureDefaultRoutes();
  const route = await resolveRoute("chat");
  const tools = getAllTools();

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
          system: systemPrompt(),
          messages,
          tools,
          toolCtx: { db },
          model: route.model,
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
