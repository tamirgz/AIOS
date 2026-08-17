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

## Quickstart (fully local, no accounts)

```bash
git clone <this-repo> AIOS && cd AIOS
cp .env.example .env.local            # every default already works locally

docker compose up -d                  # Postgres 17 + pgvector on :5544
pnpm install
ollama pull nomic-embed-text          # required: embeddings / semantic search
ollama pull qwen3:8b                  # required: the light gates + basic chat
ollama pull qwen3-coder:30b           # recommended: capable chat / ask / agents (18GB)
pnpm db:migrate                       # apply migrations (routes self-seed)

pnpm dev                              # web app → http://localhost:3777
pnpm worker                           # agent runner — separate terminal, REQUIRED
```

Open **http://localhost:3777**. That's it — you're running a fully local AI OS.

> A one-command installer (`./install.sh`) that provisions Homebrew deps, the Postgres
> container, model pulls, and the background services is on the roadmap — see
> [`docs/DISTRIBUTION-PLAN.md`](docs/DISTRIBUTION-PLAN.md). Until then, the steps above are
> the setup.

**Run it as a background service (survives reboots):** `scripts/render-launchd.sh web
worker orbstack` renders the launchd agents in `launchd/*.plist.tmpl` to your machine's
paths and installs them (web on :3777, worker, and OrbStack auto-start). Logs:
`~/Library/Logs/aios-*.log`. After a code change on a running service:
`launchctl kickstart -k gui/$(id -u)/com.aios.web` (and `.worker`).

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
