# AIOS — One-Stop Plan

*Written 2026-07-20, after v0.1 (11 milestones, all shipped & verified); status refreshed 2026-07-23. This is the working plan for turning AIOS from "an impressive dashboard" into the single place work happens.*

---

## 1 · Where we are (verified status)

**Platform.** Next.js 16 + Postgres 17/pgvector (Docker :5544) + a launchd worker daemon. One-liner start (`aios` / AIOS.command, prod default — stops the running server, wipes `.next`, rebuilds, restarts the worker). Nightly `pg_dump` backups with boot catch-up. Private GitHub repo. 21 tables. Every claim below was verified in the running system, not assumed.

**Modules (11)** — each one is a folder + 2 registry lines: Inbox, Calendar, **Workbench**, Tasks, Projects, Notes, Ideas, Knowledge, Vault, Agents, Settings.

**Workbench** *(W1 + W2, 2026-07-21 → 23)* — the one-off task surface: one box + a type picker; the type resolves executor/model/permissions. Tasks → attempts → normalized events; git isolation per attempt (worktree for in-process Claude, a local clone for CLI agents); live tail and per-file diff in-app; retry as a sibling attempt. **Executors: Claude Code (Max), AIOS-native (local), and opencode** — the last driving any **free** model: local Ollama plus free cloud (opencode-zen Big Pickle, free Nvidia via the user's key), cost-verified so paid models are refused. Verified live end-to-end on Claude, local Ollama, Big Pickle ($0) and a free Nvidia model ($0). pi and aider are seeded rows but not yet proven (pi parser mismatch; aider not installed). Details in WORKBENCH-PLAN.md §6–§8; W3 (delegation UX) is next.

**The AI layer.**
- Two providers, per-job routing (Settings): **Anthropic via Claude Max** (no API key — Agent SDK on host credentials) and **local Ollama** (any installed model, streaming, tool-calling).
- One tool registry: every module's tools are available to ⌘K chat *and* to agents (per-agent allowlists). `search.everything`, `memory.update`, `notify.send` are core tools.
- **Two-tier memory** *(hardened 2026-07-20)*: **core blocks** (who_i_am / current_focus / preferences / active_projects + up-to-12 dynamic blocks, char-budgeted, injected into every AI call, replaced values auto-archived) and **archival memory** (`memory_entries`: append-only facts/decisions/lessons/events, locally embedded, retrieved on demand via `memory.recall`; stored via `memory.remember`; both always available to chat and every agent). Weekly **Memory consolidation agent installed and enabled** (Sun 20:00) — distills work state into blocks and records durable lessons. Journal + add-block UI in Settings.
- **Deterministic fast path**: `task:`/`note:` prefixes in ⌘K → zero-token CRUD; universal capture → Inbox → AI triage (Haiku) routes to tasks/notes/knowledge/calendar.
- **Semantic search** over notes+knowledge+tasks+ideas+**220 Obsidian vault notes**, embedded locally (nomic-embed-text, model configurable with safe wipe-and-rebuild switching). "Related — by meaning" panels.

**Agents.** Cron/manual triggers, atomic run claims, heartbeats + orphan recovery, ledger-enforced idempotency, live transcripts, per-agent token usage panel, **approval queue** for risky tools (verified end-to-end). Templates contributed by modules (Daily brief, Task triage, Project pulse, Idea reviewer, Memory consolidation, Knowledge resurfacer).

**Integrations, current truth.**
| Tool | State |
|---|---|
| Obsidian | ✅ Read-only vault index → semantic search, `obsidian.read`, deep links |
| Google Calendar | ✅ **API OAuth connected and syncing** (119 events, server-side recurrence expansion, real per-event colors). Click an event → full details, physical location → Maps, and a JOIN button for meetings. ICS remains the fallback when the API is disconnected |
| Slack outbound | ✅ Built (bell → Slack) — **waiting on your webhook URL** |
| Slack inbound (routine reports) | ✅ Built for #tldr + #my-today — **waiting on your bot token** |
| Claude Desktop routines | ✅ Via the Slack intake above (they post to Slack; local jobs + drop-box also covered) |
| Claude Code (headless) | ✅ Workbench executor — delegated research and repo work, on its own branch |
| opencode + free models | ✅ Workbench executor — local Ollama and free cloud (opencode-zen Big Pickle, free Nvidia via your key), cost-verified so paid models are refused. Verified live at $0 |
| Gmail | ❌ Not built (Phase 4) — the OAuth client is already there, it needs the `gmail.readonly` scope |
| Notion | ❌ Not built (Phase 5) |
| NotebookLM | ❌ **No public API exists.** Strategy: replace the use-case, not integrate (the "Ask" phase) |

**Awaiting you (2 five-minute setups).** ~~GCP OAuth client~~ ✅ **done — Google is connected.** ① Slack bot token + channel IDs `C0A1B2C3D4E, C0F5G6H7I8J`. ② Slack incoming webhook.

**Meeting-link finding (2026-07-21, measured not assumed):** Google exposes the join URL as `hangoutLink`/`conferenceData` (31 of 72 events) and only 3 events mention it in the description — but the **Zoom add-on writes it into `location` with no conferenceData at all**, so the fallback chain is hangoutLink → conferenceData → location → description. ICS carries the same thing as `X-GOOGLE-CONFERENCE` (116 VEVENTs).

---

## 2 · The distillation: what "one-stop" actually means

The trap (the AI-OS graveyard is full of it) is rebuilding every app badly. The distillation principle:

> **AIOS does not replace your tools' editors. It becomes the one place where everything is *captured, found, briefed, and acted on*.**

Concretely, one-stop = four promises:

1. **One capture point.** Anything on your mind goes into ⌘K/Inbox and gets filed by AI. You never decide "which app does this belong to" again.
2. **One search.** `search.everything` answers from AIOS data + Obsidian + (soon) Notion + Gmail — by meaning, with links to the source. This is the NotebookLM replacement: your notebooks are already your sources.
3. **One brief.** The morning brief merges calendar + tasks + email-needing-attention + agent findings, delivered to the bell and Slack (later Telegram). You open one thing.
4. **One place agents report.** Native runs, Desktop routines, anything external — all land on the Agents page + bell.

Per-tool verdicts:
- **Obsidian** — keep writing there; AIOS reads it. Done.
- **Google Calendar / Gmail** — keep as system-of-record; AIOS is the read+remind layer, later approval-gated write.
- **Slack** — becomes a transport (reports in, notifications out), not a place you check.
- **Notion** — read-only index first. After a month of usage, decide whether Notion earns its keep or its content migrates to vault/AIOS. Not forced.
- **NotebookLM** — replaced by Phase 2 "Ask": chat over your indexed sources with citations, using free local models. Honest limitation: no audio overviews.
- **AIOS Notes vs Obsidian** — overlap acknowledged. Policy: AIOS Notes = quick scratch/AI-written; Vault = real writing. Revisit in Phase 4; consolidation candidate.

**Simplicity guardrails** (against over-complication):
- No new module unless it retires an external app or a daily friction.
- Every feature must work with zero external setup (degrade gracefully) — setup only *enhances*.
- Prefer read-only integrations; writes always via the approval queue.
- One screen per module, no nested settings, no configuration trees.

---

## 3 · Token policy — what runs free on Ollama

**Auth rule (locked 2026-07-22): AIOS never uses a metered API key** — not Anthropic, not OpenAI or any provider added later. Subscription or local auth only. Enforced in `src/core/ai/auth.ts`: metered vars are deleted from AIOS's own process at startup and stripped from every spawned executor's environment, so a stray key cannot silently start billing. Settings → "AI authentication" shows the live state. Claude authenticates via **`CLAUDE_CODE_OAUTH_TOKEN` in `.env.local`** (`claude setup-token`, filled in 2026-07-23 — earlier it was empty and auth fell back to the Keychain session). A "monthly spend limit" message is a Max-plan cap, not an API bill.

Claude Max is a quota, not a meter — the goal is spending it where judgment matters and never on volume. The routing table already supports this per key; these are the target defaults:

| Job (route key) | Model | Why |
|---|---|---|
| Embeddings + related + search index | **Ollama nomic-embed-text** *(already)* | High volume, zero tokens forever |
| `inbox.triage` | **Ollama qwen3:8b or gemma4:e4b** *(switch from Haiku)* | Simple classification + one tool call; local models handle it |
| `gmail.digest` (new) | **Ollama gemma4:31b-it-qat** | Daily volume; summarization is a local-model strength |
| `ask` / knowledge Q&A (new) | **Ollama-first**, escalate button | Retrieval does the heavy lifting; the model mostly reads |
| `knowledge.enrich` — links/quotes/text | **Ollama gemma4:31b** | Low-stakes summarization |
| `knowledge.enrich` — GitHub repos | **Claude Sonnet** | Long context + "what can I steal" judgment |
| `ideas.analyze` | **Claude Sonnet** | Adversarial judgment is the whole point |
| `chat` (⌘K with tools) | **Claude Sonnet** | Multi-tool reliability; keep the flagship sharp |
| `agent.default` (acting agents) | **Claude Sonnet** | Unattended + side-effects = no place to be cheap |
| Memory consolidation (weekly) | **Ollama gemma4:31b** | Weekly compression; verify quality once, keep |
| Workbench `research` / `code` | **Claude Code headless** (Max quota) | Judgment, web search and repo edits — measured: $0.35 for a cited research report, $0.18 for a small code fix |
| Workbench `docs` (`workbench.native` route) | **Ollama** | Structuring and summarizing AIOS's own data; free, and W2 adds opencode+qwen for local *code* too |

Rule of thumb: **volume & summarization → local; judgment & action → Claude.** Estimated effect: >80 % of daily AI calls go local once Gmail lands.

---

## 4 · Execution phases

> **Re-sequenced 2026-07-20:** the Workbench (see WORKBENCH-PLAN.md, phases W1–W3) executes **before** Phase 1 below — the usability review found one-off task delegation to be the #1 gap, and every later integration feeds into that surface.
>
> **Progress 2026-07-23:** **W1 and W2 shipped, verified, and the exit test passed.** Any coding agent is a config row; `code-local` type; per-task and Settings model override; free-model selection across local Ollama + free cloud (opencode-zen, Nvidia), cost-verified so nothing paid runs. Four executor·model combinations finished real edits through the Workbench (Claude, local Ollama, Big Pickle $0, Nvidia minimax $0). opencode's startup hang was root-caused and fixed. **W2 tails:** pi's JSON parser needs a real fixture; aider isn't installed; pi/aider cloud tiers deferred. **W3 (delegation UX) is next** and not yet started. EXECUTION-PLAN.md holds the live status table; WORKBENCH-PLAN §8 has the W2-remaining/W3 breakdown.

### Phase 1 — Close the loop (Gmail + activation + local rerouting)
*Goal: the morning brief becomes complete enough that AIOS is the first thing you open.*
- You: the 3 token setups (§1). Google client gains `gmail.readonly` scope — **one OAuth for calendar + mail**.
- Build: **Gmail module** (read-only): inbox scan job → "needs attention" classification (local model), sender/thread summaries, `gmail.search`/`gmail.read` tools, brief section "Emails".
- Reroute per §3: triage + enrichment(light) + consolidation → local. Split `knowledge.enrich` into light/deep routes.
- Daily brief v2: schedule + tasks + emails + idea nudges + agent findings, pushed to bell + Slack.
- Exit: one morning where the brief told you everything and you didn't open Gmail/Calendar first. >80 % of calls local (usage panel proves it).

### Phase 2 — One search ("Ask" = NotebookLM replacement + Notion)
*Goal: any question about anything you've ever saved gets answered in one place, free.*
- **Notion indexer**: integration token → read-only page index (same pattern as vault: sync job, embeddings, search union, deep links).
- **"Ask" page**: full-page chat with source-grounded answers and citations over knowledge+vault+notion+notes+gmail; Ollama-first with an "escalate to Claude" button on the answer.
- Gmail history joins the semantic index (embeddings are local/free).
- Exit: three real questions you'd have asked NotebookLM answered correctly with citations, zero Claude tokens.

### Phase 3 — Reach & act (phone + outbound)
*Goal: AIOS comes to you, and can act with your sign-off.*
- **Telegram bridge**: capture by message; brief delivered; approvals answered by replying — the mobile story without building an app. (Needs Tailscale or webhook tunnel.)
- **Gmail drafts** (approval-gated): agents draft replies; you approve in bell/Telegram; draft lands in Gmail.
- **Calendar write-back** (OAuth already there): `calendar.createEvent` goes to real Google Calendar — still approval-tier.
- Exit: from your phone — capture a thought, receive the brief, approve one real action.

### Phase 4 — Consolidate & polish
*Goal: subtract.*
- Notes-vs-Vault decision; retire what didn't earn its keep; module usage review (Ideas/Knowledge stats).
- Fluidity pass: global capture from any page, drag-drop between kanban stages, keyboard-first navigation everywhere.
- Auth gate + Tailscale (prerequisite hardening from Phase 3 made permanent).
- Eval loop: 👍/👎 on agent reports; per-agent quality history in the usage panel.
- Exit: you list the apps you stopped opening daily.

*Sequencing note: phases ship in order but each is independently useful; nothing in P2 blocks on P1's Gmail beyond the shared OAuth.*

---

## 5 · Standing operational rules

- `aios` starts everything (prod default, `debug`/`stop` variants); worker is a launchd daemon; **migrate ⇒ restart web+worker** (start.sh does both).
- Never rebuild while `next start` is running.
- Backups: `~/Backups/aios/`, nightly 03:30 + boot catch-up, 14 kept.
- All schema changes through drizzle migrations only — never hand-applied (the 0009 snapshot collision was the lesson).
