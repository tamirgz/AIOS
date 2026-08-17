# AIOS — container edition

Run the whole app (web + worker + Postgres) with one command. **Ollama stays on
the host** — on macOS, containers get no Metal GPU, so Ollama runs native and the
containers reach it at `host.docker.internal:11434`.

```
Host (macOS)
├── Ollama (native, Metal GPU)         ← models + embeddings
└── Docker  (Colima / Docker Desktop / OrbStack — any engine)
    └── compose: postgres · web (:3777) · worker
```

## Prerequisites
- A Docker engine — **[Colima](https://github.com/abiosoft/colima)** (free/OSS),
  Docker Desktop, or OrbStack. Any works; the compose file is engine-agnostic.
- **[Ollama](https://ollama.com)** running on the host, with models pulled:
  ```bash
  ollama pull nomic-embed-text qwen3:8b       # required (embeddings + light gates)
  ollama pull qwen3-coder:30b                 # recommended (chat/ask/agents)
  ```

## Run
```bash
docker compose -f deploy/docker-compose.yml up -d --build
# → http://localhost:3777
```
`migrate` applies the schema once (routes self-seed), then `web` and `worker`
start. Data lives in the `app_pgdata` volume. Update with `git pull` then re-run
the same command. Stop with `docker compose -f deploy/docker-compose.yml down`
(add `-v` to also drop the database volume).

Change the web port with `AIOS_WEB_PORT=3800 docker compose …`.

## Optional
- **Claude:** set `CLAUDE_CODE_OAUTH_TOKEN` in the compose environment, then route
  tasks to the `anthropic` provider in Settings.
- **MLX:** enable llmster on the host; the container already points
  `MLX_BASE_URL` at `host.docker.internal:1234`.

## Limitation — Workbench executors
The Workbench CLI harnesses (`claude-headless`, `codex`, `opencode`, `pi`) are
host-tied — they need host CLIs, their auth, git worktrees, and the macOS
seatbelt — so they **do not run inside the container**. Everything else
(chat, agents, pipelines, enrichment, search, integrations) works in-container.
For full Workbench, use the native install (see the root README) or run just the
worker natively. This is tracked for a follow-up.

The worker's nightly `pg_dump` backup is a **no-op in the container** (the Node
image has no `pg_dump`, and it would need to match Postgres 17) — it logs a
harmless "BACKUP FAILED" and continues. Back up the `app_pgdata` volume at the
Docker level instead. Also tracked as a follow-up.

## Test it in isolation
`deploy/test-deploy.sh` runs the stack on a **separate** project + port (:3778) +
volume, so it never touches a live host-native AIOS:
```bash
deploy/test-deploy.sh up      # build + start (isolated)
deploy/test-deploy.sh check   # web 200, routes seeded, worker up, chat smoke
deploy/test-deploy.sh down    # remove (incl. its volume)
```
