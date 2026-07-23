/**
 * Generic CLI executor — the point of W2.
 *
 * opencode, pi, aider and anything that comes next are *rows in the executors
 * table*, not new code paths: a command template, a parser, a timeout. The
 * engine still owns the worktree, the timeout and the process-group kill; all
 * this adapter does is substitute the template, spawn, and translate output
 * into the same normalized events every other executor emits.
 *
 * Template placeholders: {{prompt}} {{workdir}} {{model}}
 * Parsers:
 *   jsonl   — one JSON object per line (opencode `run --format json`)
 *   pi-json — pi `--mode json`
 *   text    — plain stdout, kept as text events (aider)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { subscriptionEnv } from "@/core/ai/auth";
import type { Adapter, AdapterContext, AdapterEvent, AdapterResult } from "./types";

export type CliParser = "jsonl" | "pi-json" | "text";

/**
 * launchd hands the worker a minimal PATH, so agent binaries installed in a
 * user prefix are invisible to it. Resolve the executable ourselves and give
 * children a PATH that includes the usual install locations.
 */
const BIN_DIRS = [
  join(homedir(), ".opencode", "bin"),
  join(homedir(), ".local", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
];

export function resolveBin(cmd: string): string {
  if (cmd.includes("/")) return cmd;
  for (const dir of BIN_DIRS) {
    const p = join(dir, cmd);
    if (existsSync(p)) return p;
  }
  return cmd;
}

export function childPath(): string {
  return [...BIN_DIRS, process.env.PATH ?? ""].filter(Boolean).join(":");
}

/**
 * Split a command template on whitespace, but keep quoted runs together and
 * substitute placeholders *after* splitting — so a prompt containing spaces
 * or quotes can never split into extra argv entries (no shell involved).
 */
export function buildArgv(
  template: string,
  vars: { prompt: string; workdir: string; model: string },
): string[] {
  const parts = template.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return parts.map((raw) => {
    const unquoted = /^["'].*["']$/.test(raw) ? raw.slice(1, -1) : raw;
    return unquoted
      .replaceAll("{{prompt}}", vars.prompt)
      .replaceAll("{{workdir}}", vars.workdir)
      .replaceAll("{{model}}", vars.model);
  });
}

/** opencode `run --format json` — verified against the real CLI (1.17.9). */
function parseJsonl(line: string): AdapterEvent[] {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [{ type: "text", payload: { text: line.slice(0, 800) } }];
  }
  const part = (o.part ?? {}) as Record<string, unknown>;
  switch (o.type) {
    case "text":
      return part.text
        ? [{ type: "text", payload: { text: String(part.text).slice(0, 4000) } }]
        : [];
    case "tool_use": {
      const state = (part.state ?? {}) as Record<string, unknown>;
      const failed = state.status === "error";
      return [
        {
          type: failed ? "error" : "tool_call",
          payload: {
            name: part.tool,
            input: JSON.stringify(state.input ?? {}).slice(0, 800),
            ...(failed ? { message: String(state.error).slice(0, 400) } : {}),
          },
        },
      ];
    }
    case "step_finish":
      return [
        {
          type: "usage",
          payload: { tokens: part.tokens, cost: part.cost },
        },
      ];
    case "step_start":
      return [{ type: "status", payload: { phase: "step" } }];
    default:
      return [];
  }
}

/** pi `--mode json` emits {type: "assistant"|"tool"|"result", ...} objects. */
function parsePiJson(line: string): AdapterEvent[] {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [{ type: "text", payload: { text: line.slice(0, 800) } }];
  }
  const type = String(o.type ?? "");
  if (type.includes("tool")) {
    return [
      {
        type: "tool_call",
        payload: {
          name: o.name ?? o.tool,
          input: JSON.stringify(o.input ?? o.arguments ?? {}).slice(0, 800),
        },
      },
    ];
  }
  const text = o.text ?? o.content ?? o.message;
  if (typeof text === "string" && text.trim()) {
    return [{ type: "text", payload: { text: text.slice(0, 4000) } }];
  }
  return [];
}

export const cliAdapter: Adapter = {
  id: "cli",

  async run(
    ctx: AdapterContext & {
      commandTemplate?: string;
      parser?: CliParser;
      env?: Record<string, string>;
    },
    emit,
  ): Promise<AdapterResult> {
    const template = ctx.commandTemplate;
    if (!template) return { ok: false, error: "executor has no commandTemplate" };

    const argv = buildArgv(template, {
      prompt: ctx.prompt,
      workdir: ctx.workdir,
      model: ctx.model ?? "",
    });
    const [cmd, ...args] = argv;
    const bin = resolveBin(cmd);
    if (!bin.includes("/") || !existsSync(bin)) {
      return {
        ok: false,
        error: `"${cmd}" not found — install it, or put an absolute path in the executor's command template`,
      };
    }

    const parser = ctx.parser ?? "text";
    const child = spawn(bin, args, {
      cwd: ctx.workdir,
      detached: true, // own process group, so a timeout kills its children too
      stdio: ["ignore", "pipe", "pipe"],
      // Subscription/local auth only, for every executor we spawn.
      env: subscriptionEnv({
        ...ctx.env,
        PATH: childPath(),
        HOME: process.env.HOME ?? homedir(),
        // THE root-cause fix for "opencode edits the wrong repo": the worker's
        // PWD is the AIOS project, and opencode (like many tools) trusts $PWD
        // over the actual cwd to find its project root. Inheriting the stale
        // value made every run operate in the AIOS checkout — it even wrote a
        // file there once. Pin PWD to the isolated workdir.
        PWD: ctx.workdir,
        CI: "1",
      }),
    });
    if (child.pid) ctx.onPid?.(child.pid);

    const pending: Promise<void>[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let lastText = "";
    let stderr = "";
    let buffer = "";
    let sawOutput = false;

    const handleLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;
      sawOutput = true;
      const events =
        parser === "jsonl"
          ? parseJsonl(line)
          : parser === "pi-json"
            ? parsePiJson(line)
            : [{ type: "text" as const, payload: { text: line.slice(0, 2000) } }];
      for (const e of events) {
        if (e.type === "text") lastText = String(e.payload.text ?? "");
        // Roll usage up into the attempt row so a local run shows the same
        // token/cost columns as a Claude one — zero cost is a result too.
        if (e.type === "usage") {
          const t = (e.payload.tokens ?? {}) as Record<string, number>;
          inputTokens += t.input ?? 0;
          outputTokens += t.output ?? 0;
          costUsd += Number(e.payload.cost ?? 0);
        }
        pending.push(emit(e));
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const l of lines) handleLine(l);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => {
      stderr = (stderr + c).slice(-8000);
    });

    const kill = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
      setTimeout(() => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }, 10_000).unref();
    };
    ctx.signal.addEventListener("abort", kill, { once: true });

    const exitCode = await new Promise<number>((resolve) => {
      child.on("error", (e) => {
        stderr += `\nspawn error: ${e.message}`;
        resolve(-1);
      });
      child.on("close", (code) => resolve(code ?? -1));
    });
    if (buffer.trim()) handleLine(buffer);
    await Promise.allSettled(pending);
    ctx.signal.removeEventListener("abort", kill);

    if (ctx.signal.aborted) {
      return { ok: false, exitCode, error: "cancelled or timed out" };
    }
    if (exitCode !== 0) {
      return {
        ok: false,
        exitCode,
        error: stderr.trim().slice(-800) || `exit ${exitCode}`,
      };
    }
    // A clean exit that produced nothing is a failure, not a success: it means
    // the agent hung or refused, and reporting "done" would be a lie.
    if (!sawOutput) {
      return {
        ok: false,
        exitCode,
        error: `${cmd} exited 0 without producing any output${stderr.trim() ? ` — stderr: ${stderr.trim().slice(-400)}` : ""}`,
      };
    }
    return {
      ok: true,
      exitCode,
      result: lastText.slice(0, 8000),
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      costUsd,
    };
  },
};

/** Where AIOS keeps the opencode config it manages (never the user's own). */
export const AIOS_OPENCODE_CONFIG = join(
  homedir(),
  ".aios",
  "opencode",
  "opencode.json",
);
export const AIOS_OPENCODE_DIR = dirname(AIOS_OPENCODE_CONFIG);
