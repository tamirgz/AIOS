# apOS Workbench — Usability Review, Research Findings & Build Plan

*2026-07-20; status appended 2026-07-21. Deliverable of the "review usability + research best practices + plan the agentic task system" pass. Companion to ONE-STOP-PLAN.md (whose phases re-sequence behind this).*

**Status (2026-07-23): W1 and W2 shipped and verified; W3 is next.** §6 covers the W1 spine, §7 the W2 build + free-model / free-cloud work + the opencode reliability fix, and §8 the honest W2-remaining items (pi parser, aider not installed) and the full W3 scope. Verified live: Claude, local Ollama, opencode-zen Big Pickle ($0), and a free Nvidia model ($0) each finishing a real edit through the Workbench.

---

## 1 · Honest usability audit of apOS today

**The core finding:** apOS has no home for the most common agentic need — a **one-off task**: "research X", "fix this bug", "document that module", "tell me when done". Today everything agentic is either:
- **⌘K chat** — great for 30-second actions, but ephemeral: close the palette and the conversation is gone; no history, no long-running work, no results to come back to; or
- **Standing scheduled agents** — powerful but expert-mode: creating one means naming it, writing a system prompt from scratch, and hand-picking tools from checklists. That's the right shape for *recurring* jobs, the wrong shape for "just go do this."

Ranked friction list:

| # | Issue | Severity |
|---|---|---|
| 1 | No one-off task surface (delegate → watch → review) | **Critical — the gap** |
| 2 | Chat has no persistence/history; conversations die with the palette | High |
| 3 | Agent creation = blank-prompt expert mode; no task-first presets | High |
| 4 | Model/executor choice buried in Settings routing; nothing at point of use | High |
| 5 | Run review = raw transcript dumps; no "what did I get" headline, no diff view | High |
| 6 | No coding-agent story (opencode / Claude Code headless / pi / aider) | High (explicit requirement) |
| 7 | "Needs you" moments scattered (approvals + external reports on Agents page only) | Medium |
| 8 | Power features undiscoverable (`task:`/`note:` fast paths, capture-to-inbox) | Medium |
| 9 | Empty states pretty but passive — don't teach the next action | Low |

**What already works and must not be broken:** paste-anything capture → AI triage; one-click AI per item (reality-check, enrichment); live SSE feedback everywhere; the approval queue; the module contract (folder + 2 registry lines); local-first embeddings/search.

---

## 2 · What the research says (distilled)

Full findings in the session log; the load-bearing conclusions:

**Industry convergence (vibe-kanban, Conductor, Codex cloud, Cursor background agents, Devin):**
- **Task ≠ attempt.** A task can have N attempts; each attempt = (executor, model, branch, worktree, transcript, diff). Retry with a different agent = sibling attempt on the same card; Best-of-N is just N attempts.
- **Git worktree per attempt** is the isolation standard; **diff is the review currency, PR/merge is the ceremony, chat is the steering channel**. Merge is always a human act.
- **Plan gate with countdown** (Devin): show the plan, auto-proceed in ~30s for routine types, hard approval only for risky ones. Trust is progressive per task-type.
- **Inbox beats chat at scale** (LangChain ambient-agents): all `needs_input` moments collapse to three interrupt types — *notify / question / review* — in one queue.
- One **normalized event schema** for every executor (OpenHands): live UI, logs, and replay all read the same stream.

**CLI-agent automation grades (verified against official docs):**

| Agent | Automation grade | Key facts |
|---|---|---|
| **Claude Code** | **A** | `claude -p --output-format stream-json --verbose`; final `result` event carries cost + session_id; `--allowedTools` rules; `--permission-mode`; SIGTERM-clean (exit 143); Max-subscription auth (non-`--bare`) |
| **opencode** | **A** | `opencode serve` → REST + SSE + **an HTTP approvals endpoint** that maps 1:1 onto our approval queue; first-class Ollama via openai-compatible provider config; `run --format json` fallback |
| **pi** | A- | `pi --mode json -p`; JSONL-RPC mode; Ollama via `~/.pi/agent/models.json`; must set `defaultProjectTrust` |
| **aider** | B | `--message --yes`; plain-text output only, but **auto-commits every edit** — a free granular ledger; `ollama_chat/<m>` |
| **goose** | B- | `goose run -t --no-session --max-turns`; recipes YAML = task templates; weak output contract |
| **Hermes (Nous)** | C+ *as executor* | It's a personal agent (gateway/cron shaped), not a repo-task coder — its own coding skill delegates to opencode. **Treat as a peer that reports via Slack intake, not an executor.** |

---

## 3 · Decisions (recommended)

- **D1 — Build the Workbench module**: the one-off task surface. One text box + a task-type picker; the type silently resolves executor + model + permissions (advanced override behind a fold). Tasks are cards: `queued → running → needs_input → review → done/failed`.
- **D2 — Task/attempt/event data model** per the research: `workbench_tasks`, `task_attempts`, `attempt_events` (one normalized schema for all executors). Attempts are retryable with a different executor in one click.
- **D3 — Two first-class adapters + one generic**: **Claude Code headless** (stream-json; Max quota; heavy/complex work incl. research via its WebSearch) and **opencode serve** (REST/SSE sidecar; all local-Ollama coding; its permissions endpoint plugs into our approval queue). A **generic CLI adapter** (command template + parser enum + timeout) covers **pi** and **aider** — and any future agent — as *configuration rows, not code*. Executors are editable in Settings, satisfying "configurable which agent."
- **D4 — Hermes is a peer, not an executor**: it reaches apOS through the Slack intake already built.
- **D5 — Git safety**: worktree + branch (`aios/task-<id>`) per attempt; engine commits a checkpoint at attempt end; review = `git diff main...branch` in a diff pane; **merge/PR is always a manual button**; automatic worktree cleanup on archive + orphan sweeper.
- **D6 — Task-type defaults** (Settings-editable):
  | Type | Default executor | Model | Rationale |
  |---|---|---|---|
  | research | claude-headless (WebSearch on) | Claude Sonnet | judgment + web |
  | code | claude-headless | Claude Sonnet | complex repo work on Max |
  | code-local | opencode serve | Ollama qwen3-coder:30b | private/volume work, free |
  | docs | native (module tools) | Ollama gemma4:31b | summarize/structure is local-strength |
  | custom | picker required | — | — |
- **D7 — UX rules adopted wholesale** (§2): one-box delegation, diff-first review, plan-gate-with-countdown for risky types only, needs_input → Inbox as notify/question/review, ambient status chips with heartbeat age, steer-by-message into a running session, retry-as-attempt, manual merge.
- **D8 — Re-sequencing**: Workbench (phases W1–W3) executes **before** ONE-STOP Phase 1 (Gmail). Rationale: it fixes the #1 usability gap and is the surface every later integration feeds into.
- **D9 — Quick wins ride along**: persistent chat sessions (a small `chat_sessions` table + history in ⌘K), fast-path hints in the ⌘K placeholder, actionable empty states.

## 4 · Design (Workbench module — folder + 2 registry lines, as always)

**Schema** (`src/modules/workbench/schema.ts`): `workbenchTasks` (title, prompt, taskType, repoPath?, status, createdFrom?), `taskAttempts` (executorId, model, branch, worktreePath, pid, status, exitCode, tokens/cost, startedAt/endedAt), `attemptEvents` (attemptId, ts, type, payload jsonb — append-only), `executors` seeded config (name, kind `native|cli|opencode-server|claude-headless`, commandTemplate, parser, defaultModel, gitMode, timeoutMs).

**Engine** (worker): spawn per adapter; supervise with wall-clock timeout per type, SIGTERM→grace→SIGKILL on the process group (exit 143 = cancelled), heartbeat = last-event age with stall alarm, concurrency cap 2 when Ollama is the model host; restart reconciliation via the attempts ledger (dead pid + no terminal event → `failed(interrupted)`, resumable where the executor supports `--resume`). Worktree lifecycle owned by the engine, never the adapter. Prompt always written to `.aios/task.md` in the workdir so any run is reproducible by hand.

**UI**: Workbench page (cards grouped by status, ambient chips: executor, model, turn/heartbeat, cost); task drawer = three panes (prompt+plan | live event tail | diff with per-file view); New-task = one box + type picker + optional repo picker; steer input at the bottom of a running task; retry/best-of-N buttons; merge/PR + archive on review. `needs_input` mirrors into Inbox and the bell.

**Integration hooks**: ⌘K `do:`/`delegate:` fast path → creates a Workbench task; "make this a task" action on ideas and inbox items; completed research/docs tasks offer one-click "save to Knowledge/Notes". **Memory**: task outcomes worth keeping (approach chosen, why an attempt failed) are recorded via `memory.remember` — native agents do it themselves; for CLI attempts the engine appends a short outcome event that the weekly consolidation agent distills.

## 5 · Execution phases

- **W1 — Spine (first sitting):** schema + engine + **claude-headless** and **native** adapters + minimal UI (cards, drawer with live tail + diff for repo tasks). Exit: delegate "research X" and "fix this small bug in apOS repo" from one text box; both complete unattended; review the diff in-app.
- **W2 — Executor breadth:** **opencode serve** sidecar adapter (incl. approvals bridge) + generic CLI adapter with seeded **pi** and **aider** rows + task-type defaults UI in Settings + retry-as-attempt. Exit: the same coding task run twice — once on Claude, once on opencode+qwen — as sibling attempts, compared by diff.
- **W3 — Delegation UX:** plan gate w/ countdown, needs_input→Inbox interrupts, steer-mid-run, best-of-N, merge/PR button, worktree sweeper, plus the D9 quick wins (persistent chat, hints, empty states). Exit: a full week where every one-off task went through Workbench and nothing required the terminal.
- **Then:** ONE-STOP phases resume (Gmail → Ask/Notion → Telegram → consolidation) — unchanged in content, shifted in order.

**Token policy fit:** research/complex-code on Max where judgment matters; code-local/docs types default to Ollama executors — the Workbench *increases* the share of free local work because executor choice finally exists at the point of use.

---

## 6 · W1 as built (2026-07-21) — status, deviations, evidence

**Shipped** as `src/modules/workbench/` — folder + 2 registry lines + a migration, **zero edits to worker code** (the engine registers through the existing `ModuleJob` contract: `workbench_run`, `workbench_cancel`, and a `*/2 * * * *` sweep). The worker went from 8 to 11 job channels on restart with no other change.

| Piece | State |
|---|---|
| `workbench_tasks` / `task_attempts` / `attempt_events` / `executors` schema | ✅ migration 0014 |
| Engine: atomic claim, worktree-per-attempt, per-type timeout, SIGTERM→10s→SIGKILL on the **process group**, restart reconciliation, capacity cap 2 | ✅ |
| claude-headless adapter (stream-json) | ✅ |
| native adapter (apOS providers + module tool registry) | ✅ |
| Board (grouped by where attention goes) + detail (ask · live tail · per-file diff) | ✅ |
| `workbench.delegate` / `.list` / `.get` AI tools | ✅ |
| Retry-as-attempt | ✅ **pulled forward from W2** — the data model made it ~20 lines, and without it a failed attempt was a dead card |

**Deviations from §4, and why:**

1. **Detail page, not a drawer.** A route (`/m/workbench/<id>`) is linkable, survives refresh, and matches every other module. The three panes are unchanged.
2. **Prompt file excluded from the review diff.** `.aios/task.md` is still written into the workdir for hand-reproducibility, but `commitCheckpoint` now stages with `:(exclude).aios` — the first real run committed it and it showed up as a changed file in review, which is noise. Caught by running the exit test, not by reading the code.
3. **No `needs_input` path yet.** The status exists in the enum and the board renders it; nothing emits it until the W3 interrupt work.
4. **Executor rows are seeded but not editable** — the Settings UI for them is W2, as planned.

**Exit test, run on the real system:**

| Delegated from the one box | Result |
|---|---|
| *"Research what changed in Postgres 18 vs 17 for a Drizzle + postgres.js app…"* (research) | ✅ `done` in 60 s unattended — a 400-word report with 5 concrete changes and 6 cited source URLs; 179 890 in / 2 850 out; $0.35 |
| *"In git.ts, diffSince() truncates the patch mid-line — make it line-aligned…"* (code) | ✅ `review` in 14 s on branch `aios/task-5d336dfd`; correct `truncatePatch()` helper with the reasoning comment asked for; reviewed as a per-file diff in-app |
| Retry of the same task | ✅ sibling attempt #2 on `aios/task-0df82487`, diff now **1 file** (the `.aios` fix from deviation 2, proven rather than assumed) |

**Merge stayed manual**, per D5 — both branches are still sitting there for review.

**What W1 does not yet do** (all W2/W3 by design): opencode/pi/aider executors, plan gate, steer-mid-run, best-of-N, merge/PR button, worktree sweeper, `needs_input` → Inbox.

---

## 7 · W2 as built (2026-07-22) — executor breadth

**Shipped.** A generic CLI adapter (`adapters/cli.ts`): command template with `{{prompt}}` / `{{workdir}}` / `{{model}}`, a parser (`jsonl` | `pi-json` | `text`), a timeout. **opencode, pi and aider are seeded rows in the `executors` table** — adding another agent is a row, not a deploy. Plus the `code-local` task type, a per-task executor+model override in the new-task box, and an executors panel in Settings (verified: editing a model in the UI round-trips to the DB).

**Verified end to end** with a CLI executor driving the full path — spawn → JSONL parse → 7 normalized events → worktree → checkpoint commit → per-file diff → `review`.

**What the fixtures found** (all measured against the real tools, none assumed):

| Finding | Consequence |
|---|---|
| opencode merges the user's global config, which carries personal MCP servers | apOS writes and points at **its own** config via `OPENCODE_CONFIG`; a headless run must not depend on the user's MCP servers being reachable |
| A linked worktree's `.git` is a **file**, so opencode resolves the project root to the *main* repo and treats the worktree as an **external directory** | Every write was silently blocked. Fixed with an `external_directory` allow rule scoped to that one attempt's worktree — `/world.txt` (which a local model really did attempt) is still denied |
| `write` has no permission key, so it falls through to `ask` | A headless run silently drops its own edits. `--dangerously-skip-permissions` fixes it, and explicit denies still hold |
| Local models write absolute paths and stop to ask "what next?" | The engine prepends workdir + relative-path + autonomy + date directives for CLI executors (the pitfalls the `dockerized-ollama-agent` skill already warned about) |

**Honesty fixes the runs forced** — the exit test's real value:
- An executor that exits 0 having printed **nothing** is now a failure, not a success.
- A repo attempt that changes **no files** is a no-op, not "done". `qwen3-coder:30b` announced *"I've successfully written HELLO.md"* when no such file existed anywhere on disk; apOS now reports `failed — finished without changing any files` and quotes the claim.
- CLI runs report tokens and cost in the same columns as Claude runs (local = $0).

**Exit test — PASSED 2026-07-23.** One card, the same task ("make slugify strip punctuation / collapse spaces / trim hyphens") run as two sibling attempts:

| Attempt | Executor · model | Result | Time · cost |
|---|---|---|---|
| #1 | claude-headless · claude-sonnet-5 | correct diff, spec-verified | 14s · $0.15 |
| #2 | opencode · qwen3.5:35b-a3b-coding-nvfp4 (local) | correct diff, spec-verified | 87s · **$0** |

Both reviewed in-app as per-file diffs; both branches fetched into the test repo for manual merge. This is the Max-vs-local comparison the phase was built to make — and the local one is free.

**It didn't pass until two real bugs were root-caused** (the earlier "opencode runs but performs no edits" was a symptom of both). Found by bisecting against a standalone-repo run that *did* work:

1. **Stale `PWD` — the root cause.** The worker's `PWD` is the apOS project; the adapter inherited it, and opencode (like many tools) trusts `$PWD` over the spawn `cwd` to locate its project root. So every CLI run operated in the **apOS checkout**, not the isolated dir — one run wrote `slugify.js` straight into it. Fixed by pinning `PWD` to the workdir for every spawned executor.
2. **Linked worktree confuses external agents.** A worktree's `.git` is a *file* pointing at the main repo, so opencode resolved the project there. CLI executors now use a `git clone --local` (real `.git` directory → workdir *is* the project root); the branch is fetched back into the user's repo at settle, so review/merge are unchanged. In-process claude-headless keeps the cheaper worktree.

Also removed the absolute-path preamble that made local models mangle the workdir path. The no-op detector that surfaced all of this stays.

**Free-model selection incl. free cloud (opencode-zen + Nvidia), verified live 2026-07-23.** Local executors may use any model from their free library — chosen per task in the new-task box or per executor in Settings. "Free" is **cost-verified from opencode's own pricing DB** (`~/.cache/opencode/models.json`), not provider-based: local Ollama, opencode-zen's Big Pickle / `*-free`, and the free Nvidia models all qualify; the same Nvidia key's paid models (`deepseek-v4-flash`, big nemotrons) and opencode's paid GPT-5/Claude-Opus are excluded, because the naive "provider == free" rule would have billed. A non-$0 or unknown-priced cloud model is refused at save time and before spawn (`assertFreeModel`), failing closed on billing. opencode's command template passes a full `provider/model` spec so cloud models are addressable, and the catalog is derived from opencode's pricing DB + `auth.json` by **file read, not a shell-out** — so a newly-connected key appears instantly and the Workbench/Settings pages stay at ~0.01s.

**Two free cloud models finished real edits through the Workbench, both $0:**
- `opencode/big-pickle` (opencode-zen, keyless) — improved `slugify.js` in **24s**, diff passes the spec.
- `nvidia/minimaxai/minimax-m2.7` (user's dedicated Nvidia key) — same task in **133s**, diff passes the spec.
Paid models are refused before spawn (verified with `nvidia/deepseek-v4-flash`). Nvidia's free tier is functional but slower and rate-limited (two other free models returned `429`/`410` on the shared key before the dedicated one was created).

**The opencode startup hang — root-caused and fixed.** A sampled hung process blocked at `init`. Cause: apOS's opencode config declares the Ollama provider via `npm: @ai-sdk/openai-compatible`, which wasn't in opencode's package cache, so opencode ran a `bun install` on *every* run and blocked. Fixed by pre-installing that SDK (a one-time host step, in the setup notes), pointing `OPENCODE_MODELS_PATH` at the local model DB (no models.dev fetch at init), and disabling the user's global MCP servers for apOS runs. opencode now starts in seconds.

---

## 8 · W2 remaining & the road to W3 (status 2026-07-23)

**W2 is functionally complete for the primary path (opencode).** What is seeded but *not* verified end-to-end:

- **pi** — its extension load errors are fixed (`pi-ollama` peer deps installed; the incompatible `pi-subagents` disabled) and pi runs and returns output, but it has **not** produced a reviewable diff through the Workbench. Its real `--mode json` stream (`session` / `agent_start` / `turn_start` / `message_start` events) does not match the `pi-json` parser, which was written from assumption — that parser needs to be rebuilt against a captured pi fixture.
- **aider** — a seeded config row, but the binary is **not installed** on this machine. Untested; install `aider` (or point the row at a path) before it can run.
- **pi/aider free *cloud* models** — deferred by agreement; their templates wrap local Ollama only. Only opencode carries the cloud catalog today.

**W3 — Delegation UX — reframed 2026-07-23: it dissolves into the Life-OS attention loop (ONE-STOP §3).** The keystone item below — `needs_input → Inbox` — *is* the "Needs you" spine built in phase L1, scoped up to carry every agent's cards, not just the Workbench's. The merge/PR button remains a standalone Workbench task. The rest is superseded by L1–L3. For reference, the original W3 scope and its true (unbuilt) state:

| W3 item | Where it stands |
|---|---|
| Plan-gate with countdown (show plan; auto-proceed for routine types, approve risky) | not built |
| `needs_input` → Inbox as *notify / question / review* interrupts | the status exists in the enum; nothing emits it yet |
| Steer a running attempt by message | not built |
| Best-of-N (fan out N attempts, compare) | data model already supports sibling attempts; no fan-out UI |
| Merge / PR button (real `git merge` or open a PR) | not built — `accept` only closes the card; merge is still manual on the branch |
| Worktree sweeper (age-based cleanup of stale worktrees) | partial — `reconcile` recovers interrupted/queued attempts and archive/delete clean up on demand, but nothing sweeps *old* worktrees on a schedule |
| Persistent ⌘K chat history | not built |
| Discoverability hints / actionable empty states | not built |

**W3 exit test:** a full week where every one-off task goes through the Workbench and the terminal stays untouched.
