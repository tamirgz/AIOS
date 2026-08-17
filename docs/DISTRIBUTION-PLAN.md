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
- **Ollama-only for v1.** The default installer provisions Ollama for all local models;
  LM Studio / MLX is a documented **opt-in** (a separate "enable MLX" step), not part of
  the default path — it's the heavier, more-manual half and Apple-only. Keeps the v1
  installer simple and the local stack uniform.

### Decisions (resolved)
- **License: MIT.**
- **Distribution: a single `install.sh`** (clone + provision). It **installs Homebrew
  itself if missing** (then Node/pnpm/OrbStack/Ollama through it) — no "install brew
  first" prerequisite on the user.
- **Default model tier: auto-detected from hardware.** The installer reads the Mac's RAM
  and chip (`sysctl hw.memsize`, `machdep.cpu.brand_string` / `sysctl hw.model`) and
  **recommends** a tier (see A2), pre-selecting it; the user can override.
- **MLX in v1: no** — Ollama-only default, MLX opt-in (above).
- **Container edition is the DEFAULT distribution** — the app (web + worker +
  Postgres) ships as one Docker Compose stack; **Ollama stays on the host**
  (macOS containers get no Metal GPU, so Ollama-in-container would be CPU-only).
  The native/launchd install becomes the *advanced* path. Any Docker engine works
  (Colima/Docker Desktop/OrbStack — not OrbStack-specific).

### Distribution model — two editions

**Docker edition (default, recommended).** `docker compose -f deploy/docker-compose.yml
up -d --build` runs postgres + web + worker; the containers reach host Ollama at
`host.docker.internal:11434`. No host Node/pnpm/build, no launchd — Docker's
`restart: unless-stopped` covers reboots. This is the deploy artifact users run and
CI tests. Files: `deploy/Dockerfile`, `deploy/docker-compose.yml`, `deploy/README.md`.
- **Limitation (handled):** the Workbench CLI harnesses (`claude-headless`, `codex`,
  `opencode`, `pi`) are host-tied (host CLIs + auth + git worktrees + macOS seatbelt)
  and do NOT run in the container. An availability gate detects this and **cleanly
  disables** them (never runs, never reaches for host CLI config; tasks fall back to
  `native`). Everything else works. Full CLI-agent Workbench needs the native edition.

**Native edition (advanced).** Host-native web + worker via the launchd templates
(`launchd/*.plist.tmpl` + `scripts/render-launchd.sh`), for max performance and full
Workbench. This is what P0 built and what this repo runs.

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

1. **Preflight:** assert macOS + `arm64` (else exit clearly); **detect hardware** —
   `sysctl hw.memsize` (RAM) + `sysctl hw.model` / `machdep.cpu.brand_string` (chip) —
   and pick the recommended model tier (A2). **Install Homebrew if missing**
   (non-interactive `NONINTERACTIVE=1 .../install.sh`), then continue.
2. **System deps via Homebrew** (skip if present): `node` (20+), `pnpm`, `orbstack`,
   `ollama`. (No LM Studio — MLX is a separate opt-in, A3b.)
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

### A2 — Model footprint tiers, auto-selected from hardware
Ollama-only for v1. The installer **detects RAM and recommends** a tier (pre-selected,
overridable):

| Tier | Ollama pulls | Size | Auto-recommended when |
|---|---|---|---|
| **Lite** | `nomic-embed-text`, `qwen3:8b` | ~5GB | RAM ≤ 16GB |
| **Standard** | + `qwen3-coder:30b` | ~23GB | RAM 24–48GB |
| **Full** | + `gemma4:31b-it-qat` | ~41GB | RAM ≥ 64GB |

(MLX models are **not** in any tier — they come only with the opt-in MLX step, A3b.)

Detection: `sysctl -n hw.memsize` → bytes → GB → tier. Show the detected specs and the
pick ("Detected 32GB M-series → **Standard** recommended") so it's transparent.

Models download in the background post-install; the app is usable as soon as Lite lands.
Surface a "download more models" action in Settings later. Route resolution must
**degrade gracefully** when a routed model isn't pulled yet (fall back to the smallest
available local model, not error) — critical since Lite lacks coder-30b/gemma.

### A3 — Claude-optional wiring
- On boot, `authStatus()` already reports `max-subscription | not-configured`.
- When `not-configured`: the routing layer uses **local defaults** for every task; the
  UI shows a subtle "Running fully local. Connect Claude for deeper reasoning →" card.
- "Connect Claude" flow: in-app instructions to install the `claude` CLI + run
  `claude setup-token`, with a paste field that writes `CLAUDE_CODE_OAUTH_TOKEN` to
  `.env.local` and restarts the services. (The `setup-token` step is interactive and
  can't be fully automated — this is the one honest manual gate, and it's optional.)

### A3b — MLX opt-in (post-install, optional)
Not in the default installer. A separate `aios enable-mlx` (and an in-app "Enable Apple
MLX" button) that: installs llmster (`curl -fsSL https://lmstudio.ai/install.sh | bash`),
installs the `com.aios.lmstudio` LaunchAgent (headless daemon on :1234), pulls the chosen
MLX models, and points the `ask`/`chat`/`knowledge.enrich` routes at them. Gated on
Apple Silicon + enough RAM (≥32GB suggested). Fully reversible (routes fall back to
Ollama). This is the exact setup this repo already runs — see `docs/MODEL-ROUTING.md`.

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

### B7 — Per-integration connect guides (wizard copy / docs)
Concise, step-by-step per source. These are the exact steps each connect card / wizard
step presents (and the same text seeds the user docs). Ordered easiest → hardest.

**Obsidian** (local, auto) — `obsidian_vault_path`
1. Click **Detect vaults** → AIOS reads Obsidian's vault list.
2. Pick your vault → **Use this vault**. _(Manual: paste the vault folder path.)_

**Ollama** (local, auto) — bundled
1. Nothing to do — detected at `localhost:11434`, shows ✓ with your installed models.

**Apple MLX / LM Studio** (local, opt-in) — `mlx_base_url`, `mlx_models`
1. Run **Enable Apple MLX** (installs headless llmster) — or start LM Studio's server.
2. Click **Detect** → AIOS reads `localhost:1234/v1/models` and fills the model list. ✓

**Calendar — iCal URL** (easiest calendar, no dev account) — `calendar_ics_url`
1. Google Calendar → **Settings** → click your calendar → **Integrate calendar**.
2. Copy **Secret address in iCal format** → paste → **Save**. ✓ (syncs every 5 min)

**Google Calendar + Gmail** (full, OAuth — advanced) — `google_client_id/secret`
1. **Open Google Cloud Console** (deep-link) → create a project.
2. **APIs & Services → Credentials → Create OAuth client → Web application.**
3. Paste the **redirect URI** AIOS shows (copy button) → create.
4. Enable the **Calendar** + **Gmail** APIs (deep-links).
5. Paste **Client ID** + **Client secret** → **Connect Google** → approve consent. ✓

**Slack — notifications** (webhook) — `slack_webhook_url`
1. **Create Slack app from manifest** (deep-link; scopes pre-set).
2. **Incoming Webhooks → Add New Webhook →** pick a channel.
3. Copy the webhook URL → paste. ✓

**Slack — agent reports / inbox capture** (bot) — `slack_bot_token`, `slack_*_channels`
1. In the same app: **Install to Workspace** → copy the **Bot token** (`xoxb-…`) → paste.
2. **Invite the bot** to each channel (`/invite @AIOS`).
3. **Pick channels** from the list (checkboxes — no IDs to copy). ✓

**Notion** (token) — `notion_tokens`
1. **notion.so/my-integrations** (deep-link) → **New internal integration** → copy token.
2. In Notion, **Share** the pages/databases you want with the integration.
3. Paste the token → **Add workspace**. ✓ _(Public-OAuth page-picker is a later upgrade.)_

**SearXNG — web search** (bundled) — `searxng_url`
1. Nothing to do — a SearXNG container ships in compose, pre-wired. _(Or paste your own.)_

**Gemini** (optional, metered) — `gemini_api_key`
1. **aistudio.google.com/apikey** (deep-link) → create key → paste → **Validate** (test call). ✓

**Telegram** (no auth) — `telegramChannels` rows
1. Paste a public channel **@username** (or t.me link) + relevance criteria → **Add**. ✓

**Reader proxy** (bundled) — `reader_proxy_url`
1. Nothing to do — defaults to `r.jina.ai`. _(Set `off` to stay local-only, or self-host.)_

# Testing the clean deploy

The container edition makes clean-room testing native — you test the exact artifact
users run. Three layers:

1. **Docker clean-room (built — `deploy/test-deploy.sh`).** Brings the compose stack up
   in an ISOLATED compose project on a separate port (:3778) + its own Postgres volume,
   sharing only the host's Ollama (read-only inference), so it never touches a live
   host-native AIOS. Checks: web 200, `ai_routes` self-seeded, worker booted, a chat
   round-trips against host Ollama. This is the CI backbone.
   - Note: the in-image build pins **pnpm 10.33.0** (corepack's latest, pnpm 11, exits
     non-zero on ignored build scripts) and ignores esbuild's build (prebuilt binary).
2. **macOS clean-room (for the native edition / installer, P1).** Docker can't test
   launchd/OrbStack/MLX — use a **[Tart](https://tart.run)** macOS VM (scriptable, CI-able
   on Mac hardware) or a fresh macOS user account, or a `macos-14` GitHub runner for the
   Homebrew/build parts.
3. **CI (GitHub Actions).** Run layer 1 on every push (pull a tiny Ollama model, or stub
   it); layer-2 smoke on release.

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

# Decisions — all resolved

License **MIT** · distribution a single **`install.sh`** that installs Homebrew itself if
missing · default model tier **auto-detected from RAM** · **Ollama-only v1**, MLX opt-in.
(Details in _Scope · Decisions (resolved)_ above.)
