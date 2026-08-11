/**
 * The delegation judge (A2 · Trust).
 *
 * After a delegated attempt reports success, this is the second pair of eyes:
 * it reads the ORIGINAL ask and WHAT CAME BACK (the executor's result plus the
 * files it actually changed) and rules on one question only — does the result
 * genuinely satisfy the ask? It is deliberately strict: a scaffold, a stub, a
 * "framework in place", or work on the wrong files is NOT a pass, no matter how
 * confidently the executor announced "Done". This is exactly the ask↔result
 * review a human does before trusting delegated output — automated, so every
 * delegation gets it, not just the ones someone happens to check.
 *
 * The brain is configurable in Settings (AI Routing → "workbench.judge").
 */
import { db } from "@/core/db/client";

export interface JudgeVerdict {
  pass: boolean;
  score: number; // 0–100, how completely the result meets the ask
  gaps: string[]; // concrete, actionable misses (empty on a clean pass)
  rationale: string; // one honest paragraph
  attemptSeq?: number;
}

export interface JudgeInput {
  ask: string;
  result: string | null;
  changedFiles: string[]; // paths the attempt actually touched
  patch?: string | null; // truncated unified diff, when there is one
  taskType: string;
}

const SYSTEM =
  "You are a strict delivery judge for delegated engineering work. You compare a task's ASK to what an agent PRODUCED and rule on one thing only: does the produced result genuinely satisfy the ask? " +
  "Be adversarial and literal. A scaffold, stub, placeholder, TODO, 'framework in place', or a description of what a solution WOULD do is NOT satisfying a 'do X' ask — that is a FAIL. Work done on the wrong files, or a claim of changes the diff does not show, is a FAIL. " +
  "Only pass when the concrete deliverable the ask names actually exists in the result or the changed files. Do not be charitable; the whole point of you is to catch confident-but-empty output.";

/** Pull the JSON verdict out of the model's reply, tolerant of prose/fences. */
function parseVerdict(text: string): JudgeVerdict {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const o = JSON.parse(match[0]) as Partial<JudgeVerdict>;
      return {
        pass: !!o.pass,
        score: typeof o.score === "number" ? o.score : o.pass ? 100 : 0,
        gaps: Array.isArray(o.gaps) ? o.gaps.map(String).slice(0, 12) : [],
        rationale: String(o.rationale ?? "").slice(0, 1500),
      };
    } catch {
      // fall through to the conservative default
    }
  }
  // Unparseable verdict → do not silently pass. Hold it for the human.
  return {
    pass: false,
    score: 0,
    gaps: ["The judge did not return a readable verdict."],
    rationale: text.slice(0, 800) || "No verdict returned.",
  };
}

/**
 * Run the judge for one attempt. Never throws — a judging failure must not
 * crash the run; it returns a conservative FAIL so nothing ships unverified.
 */
export async function judgeAttempt(input: JudgeInput): Promise<JudgeVerdict> {
  try {
    const { resolveRoute } = await import("@/core/ai/routing");
    const route = await resolveRoute("workbench.judge");

    const changed =
      input.changedFiles.length > 0
        ? input.changedFiles.join("\n")
        : "(the attempt changed no files)";
    const patch = input.patch ? `\n\nUNIFIED DIFF (truncated):\n${input.patch.slice(0, 12000)}` : "";

    const user =
      `THE ASK (${input.taskType}):\n${input.ask}\n\n` +
      `WHAT THE AGENT PRODUCED (its final result text):\n${(input.result ?? "(the agent returned no text)").slice(0, 12000)}\n\n` +
      `FILES THE AGENT ACTUALLY CHANGED:\n${changed}${patch}\n\n` +
      "Rule on whether the produced result satisfies the ask. Respond with ONLY a JSON object: " +
      `{"pass": boolean, "score": 0-100, "gaps": string[], "rationale": string}. ` +
      "gaps must be concrete and actionable — what is missing or wrong — and empty only on a clean pass.";

    let text = "";
    for await (const ev of route.provider.run({
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      tools: [],
      toolCtx: { db },
      model: route.model,
      maxTurns: 1,
    })) {
      if (ev.type === "text") text += ev.text;
      else if (ev.type === "done" && ev.text) text = ev.text;
      else if (ev.type === "error") throw new Error(ev.message);
    }
    return parseVerdict(text);
  } catch (e) {
    return {
      pass: false,
      score: 0,
      gaps: ["The verifying judge could not run."],
      rationale: `Judge error: ${e instanceof Error ? e.message : String(e)}. Held for your review rather than released unverified.`,
    };
  }
}
