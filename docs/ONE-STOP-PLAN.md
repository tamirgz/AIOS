# AIOS — One-Stop Plan

*Written 2026-07-20, after v0.1 (11 milestones, all shipped & verified). This is the working plan for turning AIOS from "an impressive dashboard" into the single place work happens.*

---

## 1 · Where we are (verified status)

**Platform.** Next.js 16 + Postgres 17/pgvector (Docker :5544) + a launchd worker daemon. One-liner start (`aios` / AIOS.command, prod default). Nightly `pg_dump` backups with boot catch-up. Private GitHub repo. 17 tables. Every claim below was verified in the running system, not assumed.

**Modules (10)** — each one is a folder + 2 registry lines: Inbox, Calendar, Tasks, Projects, Notes, Ideas, Knowledge, Vault, Agents, Settings.

**The AI layer.**
- Two providers, per-job routing (Settings): **Anthropic via Claude Max** (no API key — Agent SDK on host credentials) and **local Ollama** (any installed model, streaming, tool-calling).
- One tool registry: every module's tools are available to ⌘K chat *and* to agents (per-agent allowlists). `search.everything`, `memory.update`, `notify.send` are core tools.
- **Memory blocks** (who_i_am / current_focus / preferences / active_projects) injected into every AI call; agents maintain them; weekly consolidation template exists.
- **Deterministic fast path**: `task:`/`note:` prefixes in ⌘K → zero-token CRUD; universal capture → Inbox → AI triage (Haiku) routes to tasks/notes/knowledge/calendar.
- **Semantic search** over notes+knowledge+tasks+ideas+**220 Obsidian vault notes**, embedded locally (nomic-embed-text, model configurable with safe wipe-and-rebuild switching). "Related — by meaning" panels.

**Agents.** Cron/manual triggers, atomic run claims, heartbeats + orphan recovery, ledger-enforced idempotency, live transcripts, per-agent token usage panel, **approval queue** for risky tools (verified end-to-end). Templates contributed by modules (Daily brief, Task triage, Project pulse, Idea reviewer, Memory consolidation, Knowledge resurfacer).

**Integrations, current truth.**
| Tool | State |
|---|---|
| Obsidian | ✅ Read-only vault index → semantic search, `obsidian.read`, deep links |
| Google Calendar | ✅ ICS sync live (recurrence-expanded, real colors ready); full API OAuth built — **waiting on your GCP client id/secret** |
| Slack outbound | ✅ Built (bell → Slack) — **waiting on your webhook URL** |
| Slack inbound (routine reports) | ✅ Built for #tldr + #my-today — **waiting on your bot token** |
| Claude Desktop routines | ✅ Via the Slack intake above (they post to Slack; local jobs + drop-box also covered) |
| Gmail | ❌ Not built (Phase 1) |
| Notion | ❌ Not built (Phase 2) |
| NotebookLM | ❌ **No public API exists.** Strategy: replace the use-case, not integrate (Phase 2 "Ask") |

**Awaiting you (3 five-minute setups).** ① GCP OAuth client → Settings (calendar colors now, Gmail later — same client). ② Slack bot token + channel IDs `C0A1B2C3D4E, C0F5G6H7I8J`. ③ Slack incoming webhook.

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

Rule of thumb: **volume & summarization → local; judgment & action → Claude.** Estimated effect: >80 % of daily AI calls go local once Gmail lands.

---

## 4 · Execution phases

> **Re-sequenced 2026-07-20:** the Workbench (see WORKBENCH-PLAN.md, phases W1–W3) executes **before** Phase 1 below — the usability review found one-off task delegation to be the #1 gap, and every later integration feeds into that surface.

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
