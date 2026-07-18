import postgres from "postgres";

export const dynamic = "force-dynamic";

const url =
  process.env.DATABASE_URL ?? "postgres://aios:aios@localhost:5544/aios";

/**
 * SSE stream of Postgres NOTIFY events (agent_runs, agents_changed,
 * knowledge_changed). The worker NOTIFYs on every status transition; the UI
 * invalidates queries on message.
 */
export async function GET(req: Request) {
  const listener = postgres(url, { max: 1 });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (channel: string, payload: string) => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ channel, payload })}\n\n`,
            ),
          );
        } catch {
          // stream already closed
        }
      };

      for (const channel of [
        "agent_runs",
        "agents_changed",
        "knowledge_changed",
        "notifications",
        "calendar_changed",
      ]) {
        await listener.listen(channel, (payload) =>
          send(channel, payload ?? ""),
        );
      }
      send("hello", "connected");

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        listener.end({ timeout: 1 }).catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
