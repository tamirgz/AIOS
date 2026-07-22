/**
 * Auth policy: AIOS rides on subscriptions, never on metered API keys.
 *
 * Anthropic runs on the Claude Max plan via `CLAUDE_CODE_OAUTH_TOKEN`
 * (`claude setup-token`). Ollama is local and free. If a paid provider is
 * added later (OpenAI &c.) the same rule applies — subscription/local auth or
 * nothing.
 *
 * This is enforced rather than documented because the failure is silent and
 * expensive: every executor AIOS spawns inherits our environment, and both
 * the Claude CLI and the Agent SDK prefer an API key over subscription auth
 * when one is present. A stray key in a shell profile or a launchd plist
 * would quietly start billing without any visible change in behaviour.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Env vars that would make a provider bill per-token instead of per-plan. */
export const METERED_AUTH_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
] as const;

/**
 * Base-URL overrides are only suspicious when they point somewhere other than
 * the vendor's own endpoint — a redirect to a gateway is how billing sneaks
 * back in. The official host set explicitly is a no-op, so don't cry wolf.
 */
const BASE_URL_VARS: { name: string; official: string }[] = [
  { name: "ANTHROPIC_BASE_URL", official: "api.anthropic.com" },
  { name: "OPENAI_BASE_URL", official: "api.openai.com" },
];

function redirectedBaseUrls(env: NodeJS.ProcessEnv = process.env): string[] {
  return BASE_URL_VARS.filter((v) => {
    const value = env[v.name];
    return !!value && !value.includes(v.official);
  }).map((v) => v.name);
}

/**
 * Remove metered-auth vars from *this* process, once, at startup. Deleting
 * them here means every child we spawn inherits an environment that cannot
 * bill per token, no matter how the machine is configured.
 */
export function enforceSubscriptionAuth(
  log: (m: string) => void = console.warn,
): string[] {
  const found = [
    ...METERED_AUTH_VARS.filter((v) => process.env[v]),
    ...redirectedBaseUrls(),
  ];
  for (const v of found) delete process.env[v];
  if (found.length) {
    log(
      `[aios] ignoring ${found.join(", ")} — AIOS runs on the Claude Max subscription, never on a metered API key. Unset it to silence this.`,
    );
  }
  return found;
}

/**
 * Environment for a spawned executor: the current env minus anything metered,
 * plus the caller's additions. Adapters use this instead of `process.env`.
 */
export function subscriptionEnv(
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const v of METERED_AUTH_VARS) delete env[v];
  for (const v of redirectedBaseUrls(env)) delete env[v];
  return env;
}

export interface AuthStatus {
  provider: "anthropic";
  mode: "max-subscription" | "not-configured";
  /** True when `claude setup-token` has been run and the token is reachable. */
  tokenPresent: boolean;
  /** Where it came from — the web server and the worker differ, see below. */
  tokenSource: "environment" | ".env.local" | "claude-cli-session" | null;
  /** Metered vars that were found and neutralised — should always be empty. */
  neutralised: string[];
}

/**
 * Three ways the Max subscription can reach the runtime, checked in the order
 * the Claude tooling itself prefers them:
 *
 * 1. `CLAUDE_CODE_OAUTH_TOKEN` in the environment — from `claude setup-token`.
 *    Next loads `.env.local` into `process.env` at server start and the worker
 *    loads it explicitly, so in practice this is the usual answer.
 * 2. the same variable read straight from `.env.local`, for contexts that
 *    didn't load it (a bare `tsx` script, say).
 * 3. the CLI's own logged-in session in the macOS Keychain (`claude login`).
 *
 * All three are subscription auth; none is a metered API key. Both 1 and 3 can
 * be present at once — measured on this machine, an *invalid* token still
 * succeeds when a Keychain session exists, because the CLI falls back to it.
 * In an isolated HOME the token alone authenticates (and a bogus one 401s),
 * which is why the token matters for daemons that may not reach the Keychain.
 *
 * A subtlety worth keeping: `CLAUDE_CODE_OAUTH_TOKEN=` with an empty value is
 * *not* configuration — it reads as absent, which is exactly what happened
 * here before the token was filled in.
 */
function tokenSource(): AuthStatus["tokenSource"] {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return "environment";
  try {
    const text = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    // `\S` after the `=` matters: an empty assignment is not configuration.
    if (/^\s*CLAUDE_CODE_OAUTH_TOKEN\s*=\s*\S/m.test(text)) return ".env.local";
  } catch {
    // No file, or no permission to read it — fall through to the session.
  }
  return hasCliSession() ? "claude-cli-session" : null;
}

/**
 * Is the CLI logged in? Checked by *presence* only — the secret is never
 * read. On macOS the item lives in the login keychain; other platforms keep
 * a credentials file.
 */
function hasCliSession(): boolean {
  try {
    if (existsSync(join(homedir(), ".claude", ".credentials.json"))) return true;
  } catch {
    // fall through to the keychain probe
  }
  if (process.platform !== "darwin") return false;
  try {
    execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials"],
      { stdio: "ignore", timeout: 3000 },
    );
    return true;
  } catch {
    return false;
  }
}

export function authStatus(): AuthStatus {
  const source = tokenSource();
  return {
    provider: "anthropic",
    mode: source ? "max-subscription" : "not-configured",
    tokenPresent: !!source,
    tokenSource: source,
    neutralised: [
      ...METERED_AUTH_VARS.filter((v) => process.env[v]),
      ...redirectedBaseUrls(),
    ],
  };
}
