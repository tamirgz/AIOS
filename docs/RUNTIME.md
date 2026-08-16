# AIOS Runtime & Operations

How AIOS actually runs on this machine, what is containerized vs. native, how the
agents/harnesses execute, and exactly what host/global state they touch.

> Complements the README quickstart. This doc is the "where does it run and what
> does it touch" reference. Verified against the live setup on 2026-08-16.

## TL;DR (the two questions people ask)

- **Is Docker slowing the agents down?** No. **Only Postgres runs in Docker**
  (via OrbStack). Everything that does real work — the web app, the worker, the
  in-process Claude Agent SDK, Ollama, and every spawned CLI harness
  (`claude`/`codex`/`opencode`/`pi`) — runs **natively on the host** (Apple
  Silicon, full speed). Docker's only cost here is DB I/O over a localhost port,
  which is negligible.
- **Does the host setup mess with my global config?** Mostly no:
  - **Billing is actively protected** — metered API keys (`ANTHROPIC_API_KEY`,
    `OPENAI_API_KEY`, …) are stripped at startup and from every spawned child, so
    a stray key can never silently start per-token billing.
  - It does **not** modify shell profiles, system settings, or global git config.
  - All filesystem scratch is namespaced under **`~/.aios/`**.
  - **But** the Workbench CLI harnesses run under your **real `$HOME`**, so a
    "Claude Code (headless)" or "Codex" run uses your actual `~/.claude` /
    `~/.codex` CLI config (reads it; those tools may write their own state), and
    they **leave `aios/task-<id>` git branches** behind in whatever repo they
    worked on (including this one). See [Global footprint](#global--home-directory-footprint).

## Process topology

```
host (macOS, Apple Silicon)
├── launchd  com.aios.web      → scripts/web-launch.sh → next build (if stale) + next start -p 3777
│                                └── next-server (v16)            [the web app]
├── launchd  com.aios.worker   → pnpm worker → tsx src/worker/index.ts
│                                └── node (tsx) worker            [cron agents, jobs, embedding sweep]
├── launchd  com.aios.orbstack → orb start (one-shot at login)   [brings up the Docker engine]
├── Ollama.app → `ollama serve` on 127.0.0.1:11434               [local models, embeddings]
└── Docker (OrbStack)
    └── aios-postgres  pgvector/pgvector:pg17   5544→5432        [the ONLY container]
```

- Both AIOS services are **KeepAlive** LaunchAgents in `~/Library/LaunchAgents/`,
  `WorkingDirectory` = this repo, `HOME=/Users/tamirgz`, minimal `PATH`
  (`/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`). Logs at
  `~/Library/Logs/aios-{web,worker}.log`.
- `web-launch.sh` rebuilds `.next` only when `src/`, `next.config.ts`,
  `package.json`, or the lockfile changed since the last build, then serves — so
  a restart always runs the latest **working-tree** code (this is a production
  build, **no HMR**; code changes need a `kickstart`).
- The worker holds a Postgres **advisory lock** so only one instance ever runs;
  Postgres `LISTEN/NOTIFY` is the bus between worker and web.

## What's in Docker vs. on the host

| Component | Runs | Notes |
|---|---|---|
| Postgres 17 + pgvector | **Docker** (`aios-postgres`, OrbStack) | Data in named volume `aios_pgdata`. Port 5544. The only container. |
| Web app (Next 16) | Host (launchd) | Production build, port 3777. |
| Worker (agent runner) | Host (launchd, `tsx`) | Cron, jobs, embedding sweep, search-index sync. |
| Ollama (models + embeddings) | Host (`Ollama.app`) | `ollama serve` on :11434. Local + free. |
| Claude Agent SDK (chat/agents) | Host, **in-process** | No separate CLI; runs inside web/worker node process. |
| Workbench CLI harnesses | Host, **spawned subprocess** | `claude`/`codex`/`opencode`/`pi`, only during a Workbench task. |

Nothing AIOS does for AI/agents is containerized. Docker is a database detail.

## Two classes of "agent"

AIOS has two different execution paths, and the distinction matters for both
speed and footprint.

### 1. In-process AI providers — chat, scheduled agents, enrichment, inbox triage

`src/core/ai/anthropic.ts` and `ollama.ts`. These run **inside** the web/worker
node process:

- **Anthropic** = Claude Agent SDK `query()` on the **Max subscription**
  (`CLAUDE_CODE_OAUTH_TOKEN`, no API key). The SDK spawns its own bundled Claude
  Code runtime as a child, but the model is **locked to AIOS module tools** via
  an in-process MCP server — `allowedTools` = only those tools, and
  `Bash/Read/Write/Edit/Glob/Grep/WebFetch/WebSearch` are explicitly disallowed.
  So these agents **cannot touch the filesystem or shell** — they only call the
  module tools you granted them.
- **Ollama** = OpenAI-compatible HTTP to `localhost:11434`.
- Periodic/background agents deliberately run **local models** (e.g. `qwen3:8b`)
  to avoid draining the Max allowance; Claude is reserved for on-demand work.

These are the Agents-module agents. They are sandboxed to tools; they do **not**
create worktrees or use your global CLI config.

### 2. Workbench executors ("harnesses") — the powerful, sandboxed coding runs

`src/modules/workbench/`. Each executor is an **adapter**; the engine owns
isolation so a misbehaving executor can't dirty your checkout. Adapters:

| Executor | Kind | Spawns | Auth / model | Git isolation |
|---|---|---|---|---|
| Claude Code (headless) | `claude-headless` | `claude` CLI | Max sub → your `~/.claude` | worktree |
| Codex (GPT-5) | `codex-headless` | `codex exec --json` | ChatGPT sub → `~/.codex/auth.json` | worktree |
| AIOS native | `native` | — (in-process module tools) | routing table | none |
| opencode | `cli` | `opencode run` | local/free models | worktree/clone |
| pi | `cli` | `pi` | local Ollama model | worktree/clone |
| research | `research` | — (fetch + tool-free analysis) | routing table | none (scratch dir) |

- Every spawned executor gets its env from **`subscriptionEnv()`** — the current
  env **minus** all metered-auth vars and any redirected base URLs — so a
  Workbench harness can never bill per token.
- The CLI harnesses run under your **real `$HOME`** (not an isolated one), so
  they read your actual `~/.claude` (including skills — the engine deliberately
  exposes `~/.claude/skills` to runs) and `~/.codex`. Those CLIs may write their
  own state there as they normally would.
- Local coding agents run with `--dangerously-skip-permissions`; a repo-level
  `external_directory` deny rule still confines writes to the workdir.

## Auth & billing safety

Enforced in code, not just convention (`src/core/ai/auth.ts`):

- `enforceSubscriptionAuth()` **deletes** metered vars from the process at
  startup (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`,
  `AZURE_OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_API_KEY`) so
  every child inherits a clean env.
- `subscriptionEnv()` does the same per-spawn, and also strips
  `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL` when they point away from the official
  host (a gateway redirect is how billing sneaks back in).
- Subscription auth reaches the runtime three ways, in preference order:
  `CLAUDE_CODE_OAUTH_TOKEN` in env → same var read from `.env.local` → the
  `claude` CLI's Keychain session. For daemons, the token in `.env.local` is the
  reliable one (the Keychain may be unreachable).
- Gemini (if configured) is a **metered** provider and takes its key at call
  time from Settings, never from the environment — an explicit exception to the
  subscription rule, opt-in per routing.

## Global / home-directory footprint

Everything AIOS writes outside the repo, and whether it's app-private or shared
with your global tooling:

| Path | R/W | Scope | What |
|---|---|---|---|
| `~/.aios/repos/<projectId>/` | write | app-private | Read-only mirror clones of project repos (~331 MB here). |
| `~/.aios/worktrees/<id>` · `.../clone-<id>` | write | app-private | Throwaway per-attempt worktrees/clones; reclaimed on archive/delete. |
| `~/.aios/scratch/` | write | app-private | Research/no-git run scratch. |
| `~/.aios/opencode-data`, `opencode-runs`, `opencode/` | write | app-private | opencode data dirs for CLI runs. |
| `~/.aios/free-model-health.json` | write | app-private | Free-model health ledger. |
| `~/Backups/aios/` (or `$AIOS_BACKUP_DIR`) | write | app-private | Nightly `pg_dump` backups. |
| `~/AIOS/agent-reports/` | read | shared drop-box | External-agent report intake. |
| `~/.claude/` (skills, `.credentials.json`, keychain) | read | **your global config** | Auth presence + skills exposed to Workbench runs. |
| `~/.claude/jobs/` | read | **your global config** | Claude Desktop background-job intake. |
| `~/.codex/auth.json` | read | **your global config** | Codex (ChatGPT sub) login. |
| `~/.cache/opencode/models.json` | read | shared cache | NVIDIA model catalog. |
| target repo `.git` (e.g. this repo) | write | **your repo** | `git worktree`/`clone` + `aios/task-<id>` branches. |

**Not touched:** shell profiles (`.zshrc` etc.), system settings, global
`~/.gitconfig`, npm/pnpm/uv global installs. AIOS installs nothing globally
beyond its own `~/Library/LaunchAgents/com.aios.*` plists.

### Git branch leftovers (the one real housekeeping item)

Workbench worktrees/clones are throwaway and reclaimed, but the **branches they
create survive** — a run leaves `aios/task-<shortid>` in whatever repo it worked
on. Example: this repo currently carries a stray `aios/task-5d336dfd`. These are
harmless but accumulate; delete finished ones with `git branch -D aios/task-*`
once you've confirmed they're merged or unwanted.

## Operations

```bash
# Status
launchctl list | grep aios                    # web / worker / orbstack
docker ps | grep aios-postgres                # the DB container
curl -s localhost:3777 -o /dev/null -w '%{http_code}\n'   # web up?
curl -s localhost:11434/api/tags -o /dev/null -w '%{http_code}\n'  # ollama up?

# Logs
tail -f ~/Library/Logs/aios-web.log
tail -f ~/Library/Logs/aios-worker.log

# After a CODE change (production build has no HMR — you MUST restart)
launchctl kickstart -k gui/$(id -u)/com.aios.web       # rebuilds if src changed
launchctl kickstart -k gui/$(id -u)/com.aios.worker    # tsx, reads source directly

# After a DB migration: apply, THEN restart both (pooled conns don't see DDL live)
pnpm db:migrate
launchctl kickstart -k gui/$(id -u)/com.aios.worker
launchctl kickstart -k gui/$(id -u)/com.aios.web
```

> **Migration ordering trap:** there is one shared Postgres. Applying a migration
> that drops/renames columns while the launchd services still run old code will
> error until you `kickstart` the new code in. Migrate and redeploy together.

## Known drift / gotchas

- **Ollama** now runs via `Ollama.app` (`ollama serve`), not the custom
  LaunchAgent — `~/Library/LaunchAgents/com.ollama.server.plist.disabled` is
  disabled. If Ollama is unreachable, start the app (or re-enable the plist).
- **OrbStack must be up** for Postgres. `com.aios.orbstack` runs `orb start` at
  login; if the DB is unreachable, `orb start` (or open OrbStack) first.
- **Prefer arm64-native images** and keep new services on non-standard ports to
  avoid collisions (this machine already runs several stacks).
