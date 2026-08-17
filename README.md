# AIOS — Personal AI Operating System

One futuristic dashboard replacing scattered apps: tasks, projects, notes, an ideas
pipeline, a paste-anything knowledge base, calendar/mail, and autonomous AI agents — with
a plugin architecture where **adding a module is a folder + two registry lines**.

**Local-first.** With Docker + Ollama running, AIOS works end-to-end on free local models
— no account, no API keys, nothing billed. Claude and other cloud providers are optional
upgrades you turn on later, per task, in Settings.

<!-- TODO: add a screenshot / demo GIF here before publishing. -->

## Requirements

- **macOS on Apple Silicon** (the v1 target — launchd services, and MLX if you opt in).
- **Docker** via [OrbStack](https://orbstack.dev) (or Docker Desktop) — for Postgres only.
- **Node 20+** and **pnpm**.
- **[Ollama](https://ollama.com)** — local models + embeddings.

## Quickstart — one command (fully local, no accounts)

```bash
git clone https://github.com/tamirgz/AIOS.git && cd AIOS
./install.sh
```

That's the **container edition** (default): it installs any missing prerequisites
(Homebrew, a Docker engine, Ollama), auto-picks a model set from your RAM, pulls the
models, and brings the app up in Docker with Ollama on the host. When it's done it opens
**http://localhost:3777**. Re-runnable and safe. Options:

```bash
./install.sh --dry-run       # print the plan, change nothing
./install.sh --tier lite     # smaller model set (lite | standard | full)
./install.sh --native        # host-native (launchd), for full Workbench CLI agents
```

The two editions: **container** (default — `deploy/docker-compose.yml`, Ollama on host,
see [`deploy/README.md`](deploy/README.md)) and **native** (advanced — launchd services,
`docs/RUNTIME.md`).

<details><summary>Manual setup (dev / without the installer)</summary>

```bash
cp .env.example .env.local
docker compose up -d                  # Postgres 17 + pgvector on :5544 (creates the extension)
pnpm install
ollama pull nomic-embed-text qwen3:8b qwen3-coder:30b
pnpm db:migrate
pnpm dev        # web → http://localhost:3777
pnpm worker     # agent runner — separate terminal, REQUIRED
```

Background service (survives reboots): `scripts/render-launchd.sh web worker orbstack`
renders the launchd agents from `launchd/*.plist.tmpl` to your paths and installs them.
Logs: `~/Library/Logs/aios-*.log`; after a code change: `launchctl kickstart -k
gui/$(id -u)/com.aios.web` (and `.worker`).
</details>

**Operational rule:** after `pnpm db:generate && pnpm db:migrate`, restart `pnpm dev` and
`pnpm worker` — pooled Postgres connections and the worker don't pick up DDL/code live.

## Optional upgrades

- **Claude** (deeper reasoning): install the `claude` CLI, run `claude setup-token`, and
  put the token in `.env.local` as `CLAUDE_CODE_OAUTH_TOKEN`. Then re-route any task to
  the `anthropic` provider in **Settings → AI Routing**. Runs on a Claude Max/Pro
  subscription — no per-token API key.
- **Apple MLX** (faster local inference via LM Studio, Apple Silicon): opt-in — see
  [`docs/MODEL-ROUTING.md`](docs/MODEL-ROUTING.md).
- **Integrations** (Calendar, Gmail, Slack, Obsidian, Notion, web search): connect each in
  **Settings → Connections**. All optional; AIOS is fully useful with none.

## What runs on your machine — and what it never touches

- **Only Postgres runs in Docker.** The web app, the worker, and all AI run **natively**
  on the host (Apple Silicon, full speed). Docker is just the database.
- **No metered billing can start by accident:** metered API keys
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) are stripped from the process and every child
  at startup — local models and subscription auth only.
- It does **not** modify your shell profile, system settings, or global git config; all
  scratch state lives under `~/.aios/`.

See [`docs/RUNTIME.md`](docs/RUNTIME.md) for the full topology and
[`docs/MODEL-ROUTING.md`](docs/MODEL-ROUTING.md) for which model serves which task.

## Architecture in 60 seconds

- `src/core/` — shell (animated bg, sidebar, ⌘K bar), DB client, AI layer, module contract.
- `src/modules/<name>/` — one folder per module: `manifest.ts` (client metadata: nav, icon, ⌘K commands) + `manifest.server.ts` (pages, widgets, Drizzle schema, AI tools, agent templates, background jobs).
- `src/modules/registry.ts` + `registry.server.ts` — **one import line per module, per file**. That's the whole integration surface.
- `src/worker/` — host-run agent runner: cron scheduling (croner), one-live-run-per-agent DB guard, heartbeats + orphan sweep, `agent_ledger` processed-items manifest for idempotent scheduled runs, module job channels (knowledge enrichment runs here).
- AI: `AIProvider` abstraction with Ollama + Apple-MLX (OpenAI-compatible) and Anthropic (Agent SDK, subscription) adapters; per-job routing table (`ai_routes`) editable in Settings; every module's `aiTools` are auto-exposed to chat **and** agents (agents get a per-agent allowlist).
- **Memory blocks**: labeled, size-budgeted `memory_blocks` injected into every AI call; chat/agents maintain them via `memory.update`; editable in Settings.
- **Inbox**: universal capture → AI triage routes into tasks/notes/knowledge/calendar; `task:`/`note:` prefixes in ⌘K hit CRUD directly, zero tokens.
- **Semantic search**: pgvector + local `nomic-embed-text`; worker embeds new rows every 2 min; `search.everything` tool + "related — by meaning" panels.
- **Approvals**: tools can declare `risk: "approval"` — unattended agent runs park the call in a pending-approval queue instead of executing.

## Adding a module

1. `mkdir src/modules/foo` → write `manifest.ts`, `manifest.server.ts`, `schema.ts`, pages/widgets/tools.
2. Add one line to `registry.ts` and one to `registry.server.ts`.
3. `pnpm db:generate && pnpm db:migrate`, restart dev + worker.

Nav entry, routes (`/m/foo`), dashboard widgets, ⌘K commands, AI tools, agent templates, and background jobs all appear with zero core edits.

## License

[MIT](LICENSE).
