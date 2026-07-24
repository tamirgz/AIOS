# AIOS — One-Stop Plan

*Written 2026-07-20, after v0.1 (11 milestones, all shipped & verified); status refreshed 2026-07-23. This is the working plan for turning AIOS from "an impressive dashboard" into the single place work happens.*

---

## 1 · Where we are (verified status)

**Platform.** Next.js 16 + Postgres 17/pgvector (Docker :5544) + a launchd worker daemon. One-liner start (`aios` / AIOS.command, prod default — stops the running server, wipes `.next`, rebuilds, restarts the worker). Nightly `pg_dump` backups with boot catch-up. Private GitHub repo. 21 tables. Every claim below was verified in the running system, not assumed.

**Modules (16)** — each one is a folder + 2 registry lines: **Today**, **Ask**, Inbox, Calendar, **Mail**, **Workbench**, Tasks, Projects, **People**, Notes, Ideas, Knowledge, Vault, **Notion**, Agents, Settings.

**Workbench** *(W1 + W2, 2026-07-21 → 23)* — the one-off task surface: one box + a type picker; the type resolves executor/model/permissions. Tasks → attempts → normalized events; git isolation per attempt (worktree for in-process Claude, a local clone for CLI agents); live tail and per-file diff in-app; retry as a sibling attempt. **Executors: Claude Code (Max), AIOS-native (local), and opencode** — the last driving any **free** model: local Ollama plus free cloud (opencode-zen Big Pickle, free Nvidia via the user's key), cost-verified so paid models are refused. Verified live end-to-end on Claude, local Ollama, Big Pickle ($0) and a free Nvidia model ($0). pi and aider are seeded rows but not yet proven (pi parser mismatch; aider not installed). Details in WORKBENCH-PLAN.md §6–§8. **Next is the Life-OS attention loop (§3) — phases L1–L3 —** which absorbs the old "W3 delegation UX."

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
| Gmail | ✅ **Built (read-only `mail` module)** — same Google OAuth, scope now includes `gmail.readonly`. Mirrors 7 days of message metadata; `gmail.recent` feeds the Daily-planner + Follow-up tracker. **Awaiting one Connect-Google re-consent** to grant the scope (calendar keeps working; UI shows a reconnect prompt meanwhile) |
| Notion | ✅ **Built (read-only, token-gated)** — paste a Notion integration token; pages are mirrored + embedded and folded into Ask/search. Awaiting a token to activate |
| NotebookLM | ✅ **Replaced by the Ask module** — cited Q&A over your own corpus (notes/knowledge/vault/ideas/tasks/Notion), Ollama-first. Honest limit: no audio overviews |

**Awaiting you (2 five-minute setups).** ~~GCP OAuth client~~ ✅ **done — Google is connected.** ① Slack bot token + channel IDs `C0B7TLBJ4LU, C0B7VNRPQSV`. ② Slack incoming webhook.

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
- **NotebookLM** — replaced by the "Ask" phase: chat over your indexed sources with citations, using free local models. Honest limitation: no audio overviews.
- **AIOS Notes vs Obsidian** — overlap acknowledged. Policy: AIOS Notes = quick scratch/AI-written; Vault = real writing. Revisit in phase 9; consolidation candidate.

**Simplicity guardrails** (against over-complication):
- No new module unless it retires an external app or a daily friction.
- Every feature must work with zero external setup (degrade gracefully) — setup only *enhances*.
- Prefer read-only integrations; writes always via the approval queue.
- One screen per module, no nested settings, no configuration trees.

---

## 3 · AIOS as a Life OS — the attention loop *(design, 2026-07-23)*

The modules are containers; the Workbench is an execution surface. What turns AIOS into *the place you run your day, week, projects and ideas from* is a single loop that most "life OS" tools never build — because they are **spatial** (places to put things you must feed) rather than **temporal + observing** (a system with a heartbeat that maintains itself from your real activity).

**The one non-negotiable principle: observe, don't ask to be fed.** Anything that requires disciplined manual upkeep will rot. AIOS derives the management layer from surfaces that already exist in your life — calendar, email, git/Workbench, notes, and the *absence* of activity — and asks you only when there is a decision. A good chief of staff never hands you a form.

### 3.1 · The loop

```
   LIVING PROJECTS            CHIEF-OF-STAFF AGENTS          "NEEDS YOU"  +  PLAN-MY-DAY
   (the world model)  ──────► (observe & reason, free) ───► (the surface + your decision)
        ▲                                                              │
        └──────────────────  your decisions feed back  ◄──────────────┘
```

Three layers of one organism, not three features: **structure → cognition → attention.**

### 3.2 · The atom — an *attention item*

Everything an agent surfaces is one typed, project-anchored object. New table `attention_items`:

| field | meaning |
|---|---|
| `type` | `notify` \| `question` \| `review` \| `approve` \| `do` — the trust gradient lives here |
| `projectRef` | anchored to a project (`projects:<uuid>`) or to *you* personally |
| `title` / `body` | the thing, and why it surfaced |
| `source` | which agent or event produced it |
| `status` | `open` \| `snoozed` \| `done` \| `dismissed` |
| `urgency` | for queue sort and day-slotting |
| `dueAt` / `snoozedUntil` | timing |
| `payload` jsonb | e.g. a draft reply, a proposed next-action, a diff ref |

The three "views" are the *same atoms*, filtered — which is why they must be built together:

- **"Needs you" queue** = all `open` items, sorted by urgency.
- **Project cockpit** = items `WHERE projectRef = this project` + that project's rolled-up activity.
- **Plan-my-day** = *today's* items + calendar + due tasks, arranged into a proposed day.

### 3.3 · The world model — living projects

A project stops being `name + status` and gains a spine. Reuses the existing `projectRef` entity-refs (notes/ideas/tasks already carry them — the rollup substrate is already there):

- `goal` — the outcome; `nextAction` — the single next physical step (GTD's connective atom);
- `health` — **derived, not entered**: `active` if activity < N days, `stalling` if quiet, `blocked` if a linked task is flagged, `done`;
- `lastActivityAt` — derived from the newest linked task/note/idea/meeting/Workbench branch.

`nextAction` is what wires structure to rhythm: Plan-my-day pulls the next-actions of your top projects into today as `do` cards; the chaser flags a project with a missing or stale next-action; the cockpit shows it front and centre.

### 3.4 · The cognition — chief-of-staff agents *(all free, local)*

A family of agent templates that **observe and write attention items** (they replace today's one-off "send a Slack message" agents). Every one runs on a free local model (§4), on the **heartbeat**: continuous/event-driven where possible, plus morning / evening / weekly ticks.

| Agent | Cadence | Produces |
|---|---|---|
| **Daily planner** | morning | assembles Plan-my-day from calendar + due tasks + top-project next-actions + open items |
| **Project pulse** | 2–4×/day | derives `health` + `nextAction`; `notify`/`do` on stall or blocker |
| **Follow-up tracker** | after meetings / on mail | `approve`-draft or `do` card when a meeting/thread has an unmet ask |
| **Loose-ends chaser** | daily | `notify` on overdue tasks, dormant ideas, `READY` knowledge never processed |
| **Connector** | daily | `question` — "this new item relates to project X, attach it?" (makes the relations engine proactive) |
| **Weekly reviewer** | Fri/Sun | synthesises the week's items + project health into a review + a proposed next week |

### 3.5 · The trust gradient

Everything that *acts* obeys one dial, defaulted per card type and tunable per agent as trust grows (the Devin "plan-gate" generalised):

- `notify` → appears silently; `question`/`review`/`do` → proposed, you accept/edit; `approve` → **never acts without your yes** (send mail, reschedule, external writes). This is what keeps a proactive system from being either nagging or scary.

### 3.6 · Reuse discipline (don't build a fourth inbox)

- **Reuse** `projectRef` for the rollup (exists). **Reuse** `approvals` and the Workbench's `needs_input` by having the "Needs you" queue *aggregate* them — the W3 `needs_input → Inbox` item is really this spine, scoped up. **Reuse** `notifications` as the *delivery* channel (how a card also reaches Slack/phone), not a competing store. `inbox_items` stays capture-*in*; attention items are surfaced-*out*.
- **Net new:** one atom (`attention_items`), four derived fields on `projects`, three surfaces, and upgraded agent *templates*. The module contract keeps each cheap.

---

## 4 · Token policy — what runs free on Ollama

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
| **Life-OS periodic agents** — planner, pulse, follow-ups, chaser, connector (§3.4) | **Ollama `qwen3:8b`** | **Mandatory free** — these run on the heartbeat, all day. Tested 2026-07-23: reliable tool-calling with the exact schema, ~6s/call. Never on Claude |
| **Weekly reviewer** (§3.4) | **Ollama `gemma4:31b-it-qat`** | Runs 1×/week, so the 32s / higher-quality synthesis is worth it; still free |
| Workbench `research` / `code` | **Claude Code headless** (Max quota) | Judgment, web search and repo edits — measured: $0.35 for a cited research report, $0.18 for a small code fix |
| Workbench `docs` / `code-local` | **Ollama, or opencode + a $0 model** | Structuring AIOS data, or local/free-cloud coding — verified $0 live (Big Pickle, Nvidia minimax) |

Rule of thumb: **volume, summarization & the heartbeat → local (free); one-off judgment & action → Claude.** The Life-OS agents run constantly, so they are **free by rule** — a `qwen3:8b` route is set for each and the guard keeps them off Claude. Estimated effect: >80 % of daily AI calls go local; the periodic layer costs $0.

---

## 5 · Execution phases

> **Re-sequenced 2026-07-23:** Workbench W1–W2 shipped and verified. The old "W3 — delegation UX" **dissolves into the Life-OS attention loop (§3)** — its `needs_input → Inbox` item *is* the "Needs you" spine, scoped up; only the merge/PR button stays a Workbench task. The centrepiece now is the Life OS (phases **L1–L3**), because that is what makes AIOS the place the day/week/projects/ideas are run from. Gmail and "Reach & act" follow, since they *feed* and *deliver* the attention loop.
>
> **All Life-OS periodic agents run on free local models (§4): `qwen3:8b` by default, `gemma4:31b-it-qat` for the weekly review. Never Claude.**

### Phase L1 — The attention spine ✅ *shipped 2026-07-23*
*Goal: AIOS tells you what today is and what needs you.*
- **`attention_items`** table (§3.2) + the **"Needs you" queue** surface (aggregating attention items + open `approvals` + Workbench `needs_input`).
- **`nextAction`** field on projects; **Plan-my-day** surface (calendar + due tasks + today's items + top-project next-actions → a proposed day you approve; approved blocks write back to Calendar).
- One real agent — the **Daily planner** (`qwen3:8b`) — assembles Plan-my-day on the morning tick.
- The **trust gradient** (§3.5) enforced on card types (`approve` never acts without a yes).
- ✅ Built & verified live: the `today` module (Plan-my-day + "Needs you" queue aggregating attention items + approvals + Workbench needs_input), `attention_items` atom with dedupe, `nextAction` on projects, and the Daily-planner agent running on **free qwen3:8b** (74s/$0) raising typed project-anchored cards. **Exit criterion (a week of real mornings) is now a usage question, not a build one.**

### Phase L2 — Living projects ✅ *shipped 2026-07-23*
*Goal: "how are my projects doing?" answerable at a glance.*
- Projects gain `goal` / `health` (derived) / `lastActivityAt`; the **project cockpit** rolls up tasks/notes/attention via existing `projectRef`.
- **Project pulse** agent (`qwen3-coder:30b` — winner of a 12-model bench of this task) derives health + next-action, raising `notify`/`do` items on stalls and blockers.
- ✅ Built & verified live: `goal`/`health`/`healthReason`/`healthUpdatedAt` on projects; `getProjectCockpit` rollup (open/done/overdue tasks, notes, open attention, derived last-activity); the grid + detail **cockpit** (health chip, inline goal/next-action editors — persist confirmed, per-project "Needs you" cards); a pure `deriveHealth` heuristic so **health is never blank without an agent**; the Pulse agent ran on **free qwen3:8b** ($0/81s) and set health across all active projects, raising a card only for stalled/blocked. **Exit criterion met.** Caveat: an 8b model's *goal invention* is weak, so the Pulse agent ships **manual** (not auto-scheduled) until its prompt is tightened.

### Phase L3 — Chief-of-staff breadth ✅ *shipped 2026-07-23*
*Goal: agents that manage, not just execute.*
- **People/follow-ups** (CRM-lite): a `people` table derived from calendar attendees; **Follow-up tracker** agent → `do`/`approve` items after meetings, anchored to a person via `attention_items.personRef`.
- **Loose-ends chaser** (`qwen3-coder:30b`) + **Weekly reviewer** (`gemma4:31b-it-qat`).
- ✅ Built & verified live: the Google sync now captures **attendees**; the new `people` module derives a CRM-lite (12 people from the real calendar, 117 events), with a People page (meeting history + editable notes), a `people_sync` job and a dashboard widget. `attention_items` gained `personRef` so follow-ups flow into the "Needs you" queue. All **three agents installed, enabled, on free models** with schedules (follow-ups 18:00 weekdays, chaser Mon/Thu, review Fri). Verified: the Follow-up tracker ran on `qwen3-coder:30b` (free, 32s) and raised a person-anchored follow-up that appeared in the queue *and* on the person's card. **Connector** deferred (optional). **Exit criterion is now a usage question.**

*(Small W2 tails ride alongside L1: rebuild pi's JSON parser against a real fixture; install/verify aider. Workbench merge/PR button lands whenever convenient.)*

> **These integration phases follow L1–L3 and now *feed* the attention loop.** Gmail becomes a source for the Follow-up tracker and the daily plan; "Reach & act" is how the "Needs you" queue reaches your phone. The Daily-brief work folds into Plan-my-day rather than being a separate notification.

### Phase 6 — Close the loop (Gmail; feeds L3 + Plan-my-day)
*Goal: the morning brief becomes complete enough that AIOS is the first thing you open.*
- You: the 3 token setups (§1). Google client gains `gmail.readonly` scope — **one OAuth for calendar + mail**.
- Build: **Gmail module** (read-only): inbox scan job → "needs attention" classification (local model), sender/thread summaries, `gmail.search`/`gmail.read` tools, brief section "Emails".
- Reroute per §3: triage + enrichment(light) + consolidation → local. Split `knowledge.enrich` into light/deep routes.
- Daily brief v2: schedule + tasks + emails + idea nudges + agent findings, pushed to bell + Slack.
- Exit: one morning where the brief told you everything and you didn't open Gmail/Calendar first. >80 % of calls local (usage panel proves it).

### Phase 7 — One search ("Ask" = NotebookLM replacement + Notion)
*Goal: any question about anything you've ever saved gets answered in one place, free.*
- **Notion indexer**: integration token → read-only page index (same pattern as vault: sync job, embeddings, search union, deep links).
- **"Ask" page**: full-page chat with source-grounded answers and citations over knowledge+vault+notion+notes+gmail; Ollama-first with an "escalate to Claude" button on the answer.
- Gmail history joins the semantic index (embeddings are local/free).
- Exit: three real questions you'd have asked NotebookLM answered correctly with citations, zero Claude tokens.

### Phase 8 — Reach & act (the "Needs you" queue on your phone)
*Goal: AIOS comes to you, and can act with your sign-off.*
- **Telegram bridge**: capture by message; brief delivered; approvals answered by replying — the mobile story without building an app. (Needs Tailscale or webhook tunnel.)
- **Gmail drafts** (approval-gated): agents draft replies; you approve in bell/Telegram; draft lands in Gmail.
- **Calendar write-back** (OAuth already there): `calendar.createEvent` goes to real Google Calendar — still approval-tier.
- Exit: from your phone — capture a thought, receive the brief, approve one real action.

### Phase 9 — Consolidate & polish
*Goal: subtract.*
- Notes-vs-Vault decision; retire what didn't earn its keep; module usage review (Ideas/Knowledge stats).
- Fluidity pass: global capture from any page, drag-drop between kanban stages, keyboard-first navigation everywhere.
- Auth gate + Tailscale (prerequisite hardening from Phase 3 made permanent).
- Eval loop: 👍/👎 on agent reports; per-agent quality history in the usage panel.
- Exit: you list the apps you stopped opening daily.

*Sequencing note: phases ship in order but each is independently useful; L1–L3 don't depend on Gmail (they run off calendar + AIOS's own data), and Gmail then enriches them.*

---

## 6 · Standing operational rules

- `aios` starts everything (prod default, `debug`/`stop` variants); worker is a launchd daemon; **migrate ⇒ restart web+worker** (start.sh does both).
- Never rebuild while `next start` is running.
- Backups: `~/Backups/aios/`, nightly 03:30 + boot catch-up, 14 kept.
- All schema changes through drizzle migrations only — never hand-applied (the 0009 snapshot collision was the lesson).
- **Periodic/scheduled agents run on free local models, always** (§4): `qwen3:8b` default, `gemma4:31b-it-qat` for weekly synthesis. Claude is for one-off, on-demand judgment — never for the heartbeat.
