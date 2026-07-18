# AIOS — Personal AI Operating System

One futuristic dashboard replacing scattered apps: tasks, projects, notes, content pipeline, a paste-anything knowledge base, and autonomous AI agents — with a plugin architecture where **adding a module is a folder + two registry lines**.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · motion · Drizzle + Postgres 17 (Docker, port **5544**) · Claude Agent SDK (**Max subscription auth — no API key**) + Ollama · croner worker · SSE over Postgres LISTEN/NOTIFY.

## Run it

```bash
docker compose up -d      # Postgres 17 + pgvector on :5544
pnpm install
pnpm db:migrate           # apply migrations
pnpm dev                  # web app → http://localhost:3777
pnpm worker               # agent runner (separate terminal, REQUIRED for agents + knowledge enrichment)
```

Anthropic auth: works out of the box if the `claude` CLI is logged in on this machine. For a headless/daemon setup, run `claude setup-token` once and put the token in `.env.local` as `CLAUDE_CODE_OAUTH_TOKEN`. Ollama: any local model, configured per-job in **Settings → AI routing**.

**Operational rule:** after `pnpm db:generate && pnpm db:migrate`, restart `pnpm dev` and `pnpm worker` — pooled Postgres connections and the worker don't pick up DDL or code changes live.

## Architecture in 60 seconds

- `src/core/` — shell (animated bg, sidebar, ⌘K bar), DB client, AI layer, module contract.
- `src/modules/<name>/` — one folder per module: `manifest.ts` (client metadata: nav, icon, ⌘K commands) + `manifest.server.ts` (pages, widgets, Drizzle schema, AI tools, agent templates, background jobs).
- `src/modules/registry.ts` + `registry.server.ts` — **one import line per module, per file**. That's the whole integration surface.
- `src/worker/` — host-run agent runner: cron scheduling (croner), one-live-run-per-agent DB guard, heartbeats + orphan sweep, `agent_ledger` processed-items manifest for idempotent scheduled runs, module job channels (knowledge enrichment runs here).
- AI: `AIProvider` abstraction with Anthropic (Agent SDK, subscription auth) and Ollama (OpenAI-compatible) adapters; per-job routing table (`ai_routes`) editable in Settings; every module's `aiTools` are auto-exposed to chat **and** agents (agents get a per-agent allowlist).

## Adding a module

1. `mkdir src/modules/foo` → write `manifest.ts`, `manifest.server.ts`, `schema.ts`, pages/widgets/tools.
2. Add one line to `registry.ts` and one to `registry.server.ts`.
3. `pnpm db:generate && pnpm db:migrate`, restart dev + worker.

Nav entry, routes (`/m/foo`), dashboard widgets, ⌘K commands, AI tools, agent templates, and background jobs all appear with zero core edits.
