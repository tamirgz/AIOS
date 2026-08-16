/**
 * Post-handling audit for inbox triage.
 *
 * After the triage job routes a capture (into a task / note / idea / knowledge,
 * or deliberately leaves pure noise alone), a LOCAL LLM re-reads the original
 * capture and what triage actually did, and judges whether it was handled
 * PROPERLY. Pass → the item moves to "completed"; fail → "failed" (where it
 * stays visible for the user to fix). Free/local (qwen), never Claude.
 *
 * Fail-OPEN on the verifier's own trouble: if the model is unreachable or
 * returns garbage we can't parse, we don't punish a good triage — the item is
 * marked completed. Only a clear "no" from the model marks it failed.
 */
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const VERIFY_MODEL = process.env.INBOX_VERIFY_MODEL || "qwen3:8b";

export interface HandlingVerdict {
  ok: boolean;
  note: string;
}

function stripThink(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Audit one handled capture. `handling` is a short human description of what
 * triage did (e.g. `Filed as Task — "Call the lawyer Tuesday"` or
 * `Left in the inbox — judged pure noise`).
 */
export async function verifyHandling(
  input: string,
  handling: string,
): Promise<HandlingVerdict> {
  const system =
    "You audit an inbox triage. You are given a raw captured note and how an AI assistant handled it (filed it into a destination, or deliberately left it alone). Decide whether it was handled PROPERLY: routed to a sensible destination for what it is, with a title/summary that matches the capture — OR correctly left alone if it was pure noise. Mark it a failure ONLY if the handling is clearly wrong: filed as the wrong type, a summary that misreads the capture, or an actionable item dropped as noise. Reply with ONLY a JSON object: {\"ok\": true|false, \"note\": \"one short sentence saying why\"}.";
  const user = `CAPTURED:\n${input.slice(0, 1500)}\n\nHANDLED AS:\n${handling}\n\nWas this proper handling?`;
  try {
    const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VERIFY_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { ok: true, note: "audit unavailable — accepted" };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = stripThink(data.choices?.[0]?.message?.content ?? "");
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { ok?: unknown; note?: unknown };
    return {
      ok: parsed.ok !== false, // anything but an explicit false passes
      note: String(parsed.note ?? "").slice(0, 200) || "audited",
    };
  } catch {
    // Verifier hiccup is not a handling failure — fail open.
    return { ok: true, note: "audit skipped — accepted" };
  }
}
