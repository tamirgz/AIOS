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
- **Does the host setup mess with my global config?** No:
  - **Billing is actively protected** — metered API keys (`ANTHROPIC_API_KEY`,
    `OPENAI_API_KEY`, …) are stripped at startup and from every spawned child, so
    a stray key can never silently start per-token billing.
  - It does **not** modify shell profiles, system settings, or global git config.
  - All filesystem scratch is namespaced under **`~/.aios/`**.
  - The Workbench CLI harnesses run in a **private `HOME`** per kind
    (`~/.aios/harness-home/<kind>`): they read your real config (skills, settings,
    auth) through read-through symlinks but **write** their session history,
    auto-memory, and caches into the sandbox — never your real `~/.claude` /
    `~/.codex`. The auto-approve local CLIs (`opencode`/`pi`) additionally run
    under a **macOS seatbelt** that confines writes to the workdir. See
    [Harness isolation](#harness-isolation). `aios/task-*` review branches are
    reclaimed when a task is archived (if merged).

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
- **LM Studio (MLX)** = OpenAI-compatible HTTP to `localhost:1234` (provider id
  `mlx`); serves MLX models for interactive tasks (chat/ask) with native JIT
  load + idle-unload. See `src/core/ai/mlx.ts`.
- Periodic/background agents deliberately run **local models** (e.g. `qwen3:8b`)
  to avoid draining the Max allowance; Claude is reserved for on-demand work.

**Which model serves which action** — the full runtime division (LM Studio vs.
Ollama vs. Claude), with maintenance pointers, is in
[MODEL-ROUTING.md](./MODEL-ROUTING.md).

These are the Agents-module agents. They are sandboxed to tools; they do **not**
create worktrees or use your global CLI config.

### 2. Workbench executors ("harnesses") — the powerful, sandboxed coding runs

`src/modules/workbench/`. Each executor is an **adapter**; the engine owns
isolation so a misbehaving executor can't dirty your checkout. Adapters:

| Executor | Kind | Spawns | Auth / model | Isolation |
|---|---|---|---|---|
| Claude Code (headless) | `claude-headless` | `claude` CLI | Max sub (env token) | worktree + private HOME |
| Codex (GPT-5) | `codex-headless` | `codex exec --json` | ChatGPT sub (linked `auth.json`) | worktree + private HOME |
| AIOS native | `native` | — (in-process module tools) | routing table | none |
| opencode | `cli` | `opencode run` | local/free models | worktree/clone + private HOME + seatbelt |
| pi | `cli` | `pi` | local Ollama model | worktree/clone + private HOME + seatbelt |
| research | `research` | — (fetch + tool-free analysis) | routing table | none (scratch dir) |

- Every spawned executor gets its env from **`harnessEnv()`** (which wraps
  **`subscriptionEnv()`** — current env **minus** all metered-auth vars and
  redirected base URLs), so a Workbench harness can never bill per token.
- The CLI harnesses run in a **private `HOME`** (see [Harness isolation](#harness-isolation)),
  not your real one — they read your config (skills, settings, auth) through
  read-through symlinks but write their own state into the sandbox.
- Local coding agents run with `--dangerously-skip-permissions`; on top of the
  repo-level `external_directory` deny rule, the **seatbelt** confines their
  writes at the OS level.

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
| `~/.aios/harness-home/<kind>/` | write | app-private | Per-harness private HOME — session history, auto-memory, caches. |
| `~/Backups/aios/` (or `$AIOS_BACKUP_DIR`) | write | app-private | Nightly `pg_dump` backups. |
| `~/AIOS/agent-reports/` | read | shared drop-box | External-agent report intake. |
| `~/.claude/` (skills, settings, hooks, rules) | **read only** | your global config | Linked read-through into the harness HOME; writes go to the sandbox. |
| `~/.codex/auth.json`, `config.toml` | **read only** | your global config | Linked into the harness HOME; Codex session state stays in the sandbox. |
| `~/.gitconfig`, `~/.npmrc` | **read only** | your global config | Linked so in-run git/npm keep your identity. `~/.ssh` is **not** linked. |
| `~/.cache/opencode/models.json` | read | shared cache | NVIDIA model catalog. |
| target repo `.git` (e.g. this repo) | write | **your repo** | `git worktree`/`clone` + `aios/task-<id>` review branches. |

**Not touched:** shell profiles (`.zshrc` etc.), system settings, your `~/.ssh`,
npm/pnpm/uv global installs, and — now that harnesses run in a private HOME —
your real `~/.claude` / `~/.codex` **state** (only config is read, read-only).
AIOS installs nothing globally beyond its own `~/Library/LaunchAgents/com.aios.*`
plists.

## Harness isolation

The Workbench CLI harnesses are confined by `src/modules/workbench/adapters/sandbox.ts`
so a delegated run can't read or write your real global tool state, while still
behaving exactly as it does under your real home.

- **Private HOME** (`harnessEnv`): each kind runs with
  `HOME=~/.aios/harness-home/<claude|codex|cli>` (+ XDG dirs for the cli tools).
  Session history, auto-memory, sqlite state and caches land there. The config
  the harness needs is linked **read-through**: Claude mirrors all of `~/.claude`
  *except* the write-pollution dirs (`projects`, `sessions`, `shell-snapshots`,
  …); Codex/opencode link the specific auth+config entries. `~/.gitconfig` /
  `~/.npmrc` are linked for in-run git/npm; `~/.ssh` is deliberately **not**.
  Auth is unaffected — the Claude token authenticates from the env even in an
  isolated HOME, Codex reads the linked `auth.json`.
- **Seatbelt** (`maybeSeatbelt`): the auto-approve local CLIs (`opencode`/`pi`)
  are wrapped in `sandbox-exec` with an OS-enforced profile that confines file
  **writes** to the workdir + sandbox home + tmp (reads/exec/network stay open).
  Disable with `WORKBENCH_SEATBELT=off` if a run legitimately needs to write
  elsewhere.
- **Billing safety** rides underneath: `harnessEnv` wraps `subscriptionEnv`, so
  metered keys are stripped from every harness regardless.

### Git branch housekeeping

A worktree/clone run leaves an `aios/task-<shortid>` review branch in whatever
repo it worked on. Worktrees/clones are reclaimed automatically, and **archiving
a task now deletes its branch when the work is already merged** (unmerged
branches survive — they may hold the only copy of work you haven't taken). To
sweep merged leftovers by hand: `git branch --merged main | grep aios/task- |
xargs git branch -d`.

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
