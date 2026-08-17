# AIOS Distribution & 1-Click Onboarding Plan

Turning AIOS from a single-machine build into an open-source project the public can
install in one command, and collapsing every integration from "endless clicks" to
per-source one-click connects.

## Scope (decided)

- **Local-first, Claude optional.** Works out of the box on Ollama + LM Studio (free,
  no account). Claude Max is an opt-in upgrade, never required to install or run.
- **macOS / Apple Silicon** for v1 (launchd, OrbStack, MLX are all Apple-only anyway).
  Linux is a later phase (Ollama-only, no MLX; systemd instead of launchd).
- **Guided BYO-OAuth wizard** for Google/Slack/Notion — each user keeps their own
  OAuth app, but the flow is collapsed to a tight wizard. No AIOS-hosted OAuth broker
  (keeps it truly self-hosted, no shared-secret / hosting / app-verification burden).

---

# Part A — Packaging: one-command installer

### The problem today
There is **no install script** (`start.sh` is the closest but assumes every prereq is
already present), **no `.env.example`**, and all four launchd plists + `web-launch.sh`
**hardcode `/Users/tamirgz/...`**. A fresh machine needs: Homebrew, Node 20+, pnpm,
OrbStack, Ollama (+~40GB models), optionally LM Studio/llmster (+~40GB MLX), the
Postgres container, `.env.local`, DB migrations, and 4 templated launchd agents.

### A0 — Make the repo public-ready (P0, prerequisite for everything)
1. **De-hardcode paths.** Template `$HOME`, `$USER`, and repo path in `launchd/*.plist`
   and `scripts/web-launch.sh` (drive from `AIOS_DIR` + `id -un`, already partially
   supported). Move all four plists (web, worker, **lmstudio**, **orbstack**) into
   `launchd/` as `.plist.tmpl` — two of them aren't committed today.
2. **Add `.env.example`** with every var the map found (DATABASE_URL, OLLAMA_BASE_URL,
   MLX_BASE_URL, SEARXNG_URL, optional CLAUDE_CODE_OAUTH_TOKEN, NVIDIA_API_KEY,
   AIOS_BACKUP_DIR, APP_BASE_URL, INBOX_VERIFY_MODEL, ASK_JUDGE_MODEL) — annotated,
   with the local-first defaults.
3. **LICENSE** (pick one — MIT is the low-friction default for adoption), a rewritten
   **README** with the one-command install, a screenshot/GIF, and a "what runs on your
   machine / what it never touches" section (lift from `docs/RUNTIME.md`).
4. **Make routing defaults local-first.** `routing.ts` DEFAULTS already seed Ollama for
   ask/gates; change the remaining Claude-defaulted keys (chat, agent.default,
   knowledge.enrich, ideas.analyze, inbox.triage, project.advisor, workbench.native) to
   local models **when Claude is not configured** — see A3. Fresh installs must be
   fully functional with zero cloud accounts.
5. **Security pass for public code:** confirm `.env*` is git-ignored (it is), scrub any
   personal data from committed seed/fixtures (there are none — routes self-seed), and
   confirm the metered-key stripping in `auth.ts` stays intact.

### A1 — The installer (`install.sh`) — P1
One script (`curl -fsSL <raw>/install.sh | bash`, or `git clone && ./install.sh`) that
is **idempotent** (safe to re-run) and prints progress. Steps:

1. **Preflight:** assert macOS + `arm64`; else exit with a clear message. Check for
   Homebrew; offer to install it.
2. **System deps via Homebrew** (skip if present): `node` (20+), `pnpm`, `orbstack`,
   `ollama`. Optional prompt: LM Studio (cask) or llmster (`curl .../install.sh`).
3. **Clone/checkout** into a chosen dir (default `~/Projects/AIOS` or `~/AIOS`); run
   `pnpm install`.
4. **Database:** `orb start` → wait for `docker info` → `docker compose up -d` → poll
   `pg_isready`. Write `DATABASE_URL` (or rely on the `:5544` fallback).
5. **Env:** copy `.env.example` → `.env.local`, fill machine-specific values. **No Claude
   token required** (local-first). Leave `CLAUDE_CODE_OAUTH_TOKEN=` empty.
6. **Models (tiered — see A2):** `ollama pull` the chosen tier in the background with a
   progress readout. Skip anything already pulled.
7. **Migrate:** `pnpm db:migrate` (routes self-seed via `ensureDefaultRoutes()`).
8. **Build:** `pnpm build`.
9. **Services:** render the 4 plist templates with the real user/paths → write to
   `~/Library/LaunchAgents/` → `launchctl bootstrap gui/$(id -u)`. (web, worker,
   orbstack, lmstudio — lmstudio only if the user chose MLX.)
10. **Verify + open:** health-check `curl localhost:3777`, `localhost:11434/api/tags`,
    and (if MLX) `localhost:1234/v1/models`; print a status table; `open http://localhost:3777`.

### A2 — Model footprint tiers (the single biggest onboarding friction)
Full local stack is **~80GB** of downloads (Ollama coder-30b 18GB + gemma 18GB +
qwen3:8b 5GB + nomic; MLX coder 17GB + abliterated 20GB). Offer a choice at install:

| Tier | Pulls | Size | Good for |
|---|---|---|---|
| **Lite** (default) | `nomic-embed-text`, `qwen3:8b` | ~5GB | Gates, embeddings, basic chat/ask on 8B. Runs on 16GB Macs. |
| **Standard** | + `qwen3-coder:30b` | ~23GB | Real ask/chat/judge quality. 32GB+ Macs. |
| **Full** | + `gemma4:31b`, + MLX (LM Studio) models | ~80GB | Everything, MLX speed. 64GB Macs. |

Models download in the background post-install; the app is usable as soon as Lite lands.
Surface a "download more models" action in Settings later. Route resolution must
**degrade gracefully** when a routed model isn't pulled yet (fall back to the smallest
available local model, not error).

### A3 — Claude-optional wiring
- On boot, `authStatus()` already reports `max-subscription | not-configured`.
- When `not-configured`: the routing layer uses **local defaults** for every task; the
  UI shows a subtle "Running fully local. Connect Claude for deeper reasoning →" card.
- "Connect Claude" flow: in-app instructions to install the `claude` CLI + run
  `claude setup-token`, with a paste field that writes `CLAUDE_CODE_OAUTH_TOKEN` to
  `.env.local` and restarts the services. (The `setup-token` step is interactive and
  can't be fully automated — this is the one honest manual gate, and it's optional.)

### A4 — Manage / uninstall
- `aios` helper (or `make` targets): `start | stop | status | update | logs | uninstall`.
  `status` = the health table; `update` = `git pull && pnpm install && db:migrate &&
  build && kickstart`; `uninstall` = bootout the agents, `docker compose down -v`,
  remove plists + `~/.aios` (prompt before deleting data).

---

# Part B — 1-Click Integrations

### The problem today
Config lives in one `app_settings` table, but setting keys are **bare string literals
duplicated** across `ConnectionsPage.tsx`, `IntegrationsEditor.tsx`, `actions.ts`, and
each module — no registry. The `ALLOWED_INTEGRATION_KEYS` allowlist is hand-maintained
and **already silently drops `mlx_base_url` / `mlx_models`** (they render in the UI but
throw "unknown setting" on save — a live bug). Every integration is a raw
paste-into-a-textbox; OAuth ones make the user create their own cloud app.

### B0 — Integration registry (the backbone) — do this first
Create `src/core/integrations/registry.ts`: one typed entry per integration —
`{ id, label, category, icon, mechanism, fields[], validate(), statusCheck(),
connectRoute?, workerChannel?, docsUrl }`. Generate from it:
- the `ALLOWED_INTEGRATION_KEYS` allowlist (**kills the mlx save-bug class permanently**),
- the Connections UI (cards render from the registry),
- the per-source status probe,
- the docs.

`mechanism ∈ { local-autodetect, oauth-wizard, webhook, token-paste, api-key,
bundled }` drives which connect UX renders.

### B1 — Connections page redesign
Replace the flat list of text fields with **status cards**, one per source: icon, name,
a **live status pill** (Connected ✓ / Not connected / Error — from `statusCheck()`), and
**one primary button** whose label/behavior comes from `mechanism`. Group by category
(Local · Calendar & Mail · Chat · Knowledge · AI providers). Advanced/raw fields hide
behind a "Manual setup" disclosure.

### B2 — Tier 1: Local auto-detect (Easy — ship first, biggest win/effort ratio)
No external accounts; these become genuinely one-click:
- **Obsidian:** read Obsidian's own `~/Library/Application Support/obsidian/obsidian.json`
  vault registry (and scan `~/Documents`, iCloud Obsidian dir) → show detected vaults →
  "Use this vault" button. No path paste.
- **Ollama:** probe `localhost:11434/api/tags` → auto-connected, list installed models.
- **LM Studio / MLX:** probe `localhost:1234/v1/models` → auto-fill `mlx_base_url` +
  `mlx_models`. **(Requires the B0 allowlist fix to save at all.)**
- **Reader proxy / Telegram / SearXNG-bundled:** already zero/low-config — just show them
  as Connected by default.

### B3 — Tier 2: Guided OAuth wizard (BYO — Google, Slack, Notion)
Keep the user's own OAuth app but collapse the flow into a stepper that does the clicking
*for* them where possible:
- **Deep-link to the exact console page** (e.g. Google Cloud "Create OAuth client",
  Slack "Create app from manifest", Notion "New integration").
- **Slack/Notion: ship an app manifest** — the user imports a prebuilt manifest (scopes,
  redirect, name all pre-set) instead of clicking each toggle. Cuts Slack from ~7 steps
  to ~2.
- **Auto-fill + copy** the redirect URI (`http://localhost:3777/api/google/callback`) so
  it can't be mistyped; a "copy" button per field.
- **Live "waiting for connection… ✓ connected"** polling after the user clicks Connect,
  so they get instant confirmation instead of guessing.
- **Channel/page pickers, not ID paste:** after auth, call `conversations.list` /
  Notion search and let the user *check boxes* for Slack channels / Notion pages —
  replaces the comma-separated-ID textboxes for `slack_report_channels`,
  `slack_inbox_channels`, and Notion page selection.
- **Default calendar path = ICS** (no dev account): present "Paste your calendar's secret
  iCal URL" as the primary, one-paste option; full Google OAuth (adds Gmail) is the
  "advanced / connect more" upgrade. This makes calendar effectively one-paste for most.

### B4 — Tier 3: Metered key-paste (Gemini, NVIDIA)
Inherently the user's own billed key — can't be one-click without AIOS paying for
inference. Best UX: deep-link to the key page, a masked paste field, and a **validate
button** that does a real test call and shows ✓/✗. Label clearly as "optional · metered."
Also **surface NVIDIA in the UI** (today it's env-only/hidden) or drop it.

### B5 — Bundle SearXNG (zero-config web search)
Add a SearXNG service to `docker-compose.yml` with JSON format enabled, default
`SEARXNG_URL=http://localhost:8080`. Ask web-enrichment then works out of the box with no
self-hosting step — moves SearXNG from "Hard (bring your own)" to "Done (bundled)."

### B6 — First-run onboarding wizard
After install, a short in-app wizard (not the full Settings page): detect locals
(Obsidian/Ollama/LM Studio) and offer one-click connects, then a 3-card "connect your
world" step (Calendar via ICS · Slack via manifest · Notion) that the user can skip.
Everything is skippable; AIOS is fully useful with zero integrations.

---

# Milestones

- **P0 — Public-ready repo:** de-hardcode plists, `.env.example`, LICENSE, README,
  local-first routing defaults. (Unblocks everything.)
- **P1 — One-command installer + model tiers + graceful model fallback.**
- **P2 — Integration registry (B0) + Connections card redesign (B1) + local auto-detect
  (B2) + fix the mlx allowlist bug + bundle SearXNG (B5).** (High value, low external risk.)
- **P3 — Guided OAuth wizard (B3): manifests, deep-links, live status, channel/page
  pickers.**
- **P4 — First-run onboarding (B6), key-paste polish (B4), `aios` manage/uninstall CLI,
  docs + demo GIF.**
- **Later — Linux edition** (Ollama-only, systemd), Windows.

# Risks & honest constraints

- **Model download size is the #1 friction.** ~5GB (Lite) is fine; Full is ~80GB. Tiers +
  background download + graceful fallback are mandatory, not optional.
- **macOS-only, MLX Apple-only.** Non-Mac users get a clear "not yet" message.
- **BYO-OAuth can't be fully eliminated** — Google still requires the user to create a
  client; the wizard + ICS/webhook fallbacks minimize but don't remove this. A true
  one-click would need a hosted broker (explicitly rejected).
- **`claude setup-token` is interactive** — the one manual gate, and it's optional under
  local-first.
- **Bundling SearXNG** adds a second container (small).
- **Support surface:** a public installer invites issues across varied Mac setups
  (Homebrew states, disk space, ports in use). The installer must be idempotent and
  print actionable errors.

# Open decisions (for you)

1. **License** — MIT (max adoption) vs something more restrictive?
2. **Distro shape** — pure `install.sh` (clone + provision) vs a Homebrew tap
   (`brew install aios`) that wraps it? Tap is nicer UX but more maintenance.
3. **Default tier** — Lite (works on 16GB, weaker) vs Standard (needs 32GB) as the
   out-of-box default?
4. **Bundle LM Studio/MLX at all in v1**, or ship Ollama-only by default and make MLX a
   documented opt-in (simpler installer, since MLX is the heavier/more-manual half)?
