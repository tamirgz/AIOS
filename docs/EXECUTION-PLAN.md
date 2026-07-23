# AIOS — Recommended Execution Plan

*Written 2026-07-20; status updated 2026-07-23. The single consolidated sequence. Details live in WORKBENCH-PLAN.md (Workbench design/research) and ONE-STOP-PLAN.md (integrations, token policy, distillation strategy); this file is the order of battle.*

## Done (foundation, all shipped & verified)

M0–M10: shell + 10 modules · two-provider AI layer (Claude Max, no key + Ollama, per-job routing) · agents (cron, ledgers, approvals, live transcripts, usage panel) · semantic search over all data + Obsidian vault (local embeddings, configurable model) · Google Calendar (ICS live, API OAuth ready) · Slack in+out (awaiting tokens) · external-report intakes · Ideas pipeline with AI reality-check · ops (daemons, backups, `aios` one-liner) · **two-tier memory: core blocks + archival remember/recall with provenance, consolidation agent enabled**.

**W2 — Executor breadth (2026-07-22 → 23, exit test passed; free cloud verified live 2026-07-23).** Generic CLI adapter: any coding agent is a config row (command template, parser, timeout), not code. opencode/pi/aider seeded; `code-local` task type; per-task executor+model override; Settings panel. Honesty hardened: an executor that prints nothing, or changes no files, is reported as failed, not done. CLI executors run in a local **clone** (real `.git`, correct project root), and `PWD` is pinned to the isolated dir — without which opencode edited the AIOS checkout itself. **Free-model selection** across local Ollama + free cloud (opencode-zen Big Pickle, free Nvidia models), cost-verified from opencode's pricing DB so paid models are refused before spawn; catalog built by file read (pages ~0.01s). **Verified live, all $0:** Big Pickle finished a real edit in 24s, a free Nvidia model (minimax-m2.7) in 133s — both through the Workbench, diffs spec-checked. Root-caused and fixed opencode's startup hang (missing `@ai-sdk/openai-compatible` → `bun install` on every run). **W2 remaining:** pi runs but its JSON parser needs rebuilding against a real fixture; aider is not installed; pi/aider cloud tiers deferred. Detail in WORKBENCH-PLAN §7–§8.

**W1 — Workbench spine (2026-07-21).** 11th module. One-box delegation → executor runs unattended → review in-app. Task/attempt/event schema; supervision engine (git worktree per attempt, per-type timeouts, SIGTERM→SIGKILL on the process group, restart reconciliation, capacity cap 2); claude-headless + native adapters; board + detail with live tail and per-file diff; `workbench.delegate/list/get` tools. Zero worker-code edits — two registry lines, as promised.

## Sequence

| # | Phase | Contents | Exit test | Status |
|---|---|---|---|---|
| 0 | **Activation** *(Slack only left)* | GCP OAuth client → Settings; Slack bot token + channels; Slack webhook | Calendar shows event colors; #tldr/#my-today in External Reports; bell reaches Slack | 🟡 **Google done** (OAuth connected, 119 events, real colors, meeting links). Slack tokens still yours to add |
| 1 | **W1 — Workbench spine** | Task/attempt/event schema; supervision engine (worktrees, timeouts, SIGTERM-safe, reconciliation); claude-headless + native adapters; cards + drawer UI (live tail, diff) | Delegate "research X" and "fix this bug" from one text box; both finish unattended; diff reviewed in-app | ✅ **Shipped 2026-07-21** — exit test passed on the real system (see WORKBENCH-PLAN §6) |
| 2 | **W2 — Executor breadth** | Generic CLI adapter (template + parser + timeout); opencode/pi/aider as executor **rows**; `code-local` type; per-task executor override; executors panel in Settings | Same coding task run on Claude and opencode+qwen as sibling attempts, compared by diff | ✅ **PASSED 2026-07-23** — one card, Claude Sonnet (14s/$0.15) + opencode·qwen3.5-coder (87s/**$0**), both correct diffs reviewed in-app. Two root-caused bugs fixed (stale PWD; linked-worktree → clone). See WORKBENCH-PLAN §7 |
| 3 | **W3 — Delegation UX** *(next)* | Plan-gate w/ countdown; needs_input → Inbox (notify/question/review); steer-mid-run; best-of-N; merge/PR button; scheduled worktree sweeper; persistent ⌘K chat history; discoverability hints | A week of one-off tasks entirely through Workbench, terminal untouched | ⬜ **not started** — none of these exist yet (the `needs_input` status is in the enum but unused). Small W2 tails first: pi parser vs. a real fixture; install/verify aider |
| 4 | **Gmail + local rerouting** *(ONE-STOP P1)* | Gmail read-only module (same OAuth); brief v2 (calendar+tasks+email+agent findings); reroute triage/light-enrichment/digests to Ollama | One morning where the brief made opening Gmail/Calendar unnecessary; >80 % of AI calls local (usage panel) | ⬜ needs `gmail.readonly` added to the existing consent screen |
| 5 | **"Ask" + Notion** *(P2)* | Notion read-only index; Ask page — cited Q&A over knowledge/vault/notion/gmail, Ollama-first with escalate button; Gmail history embedded | 3 NotebookLM-grade questions answered with citations, zero Claude tokens | ⬜ needs Notion integration token |
| 6 | **Reach & act** *(P3)* | Telegram bridge (capture/brief/approvals from phone); approval-gated Gmail drafts; Calendar write-back | From the phone: capture, receive brief, approve one real action | ⬜ needs Tailscale (or tunnel) |
| 7 | **Consolidate** *(P4)* | Notes-vs-Vault decision; retire unused; fluidity pass; auth gate; agent evals (👍/👎 → quality history) | The list of apps you stopped opening daily | ⬜ |

## Standing principles

- **Memory is load-bearing**: blocks stay terse (budgets enforced); everything durable goes to archival via `memory.remember`; agents recall before re-deciding; the Sunday consolidation agent keeps both fresh. Nothing important lives only in a chat transcript.
- **Volume & summarization → local Ollama; judgment & action → Claude Max.**
- **Merge is manual, always.** Agent work stays on its branch until you click.
- **Every phase independently useful; every exit test runs in the real system.**
- Operational: `aios` to start (prod default); migrate ⇒ restart web+worker; never rebuild under a running server; backups nightly at 03:30.
