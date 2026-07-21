# AIOS — Recommended Execution Plan

*Written 2026-07-20; status updated 2026-07-21. The single consolidated sequence. Details live in WORKBENCH-PLAN.md (Workbench design/research) and ONE-STOP-PLAN.md (integrations, token policy, distillation strategy); this file is the order of battle.*

## Done (foundation, all shipped & verified)

M0–M10: shell + 10 modules · two-provider AI layer (Claude Max, no key + Ollama, per-job routing) · agents (cron, ledgers, approvals, live transcripts, usage panel) · semantic search over all data + Obsidian vault (local embeddings, configurable model) · Google Calendar (ICS live, API OAuth ready) · Slack in+out (awaiting tokens) · external-report intakes · Ideas pipeline with AI reality-check · ops (daemons, backups, `aios` one-liner) · **two-tier memory: core blocks + archival remember/recall with provenance, consolidation agent enabled**.

**W1 — Workbench spine (2026-07-21).** 11th module. One-box delegation → executor runs unattended → review in-app. Task/attempt/event schema; supervision engine (git worktree per attempt, per-type timeouts, SIGTERM→SIGKILL on the process group, restart reconciliation, capacity cap 2); claude-headless + native adapters; board + detail with live tail and per-file diff; `workbench.delegate/list/get` tools. Zero worker-code edits — two registry lines, as promised.

## Sequence

| # | Phase | Contents | Exit test | Status |
|---|---|---|---|---|
| 0 | **Activation** *(~10 min left)* | GCP OAuth client → Settings; Slack bot token + channels; Slack webhook | Calendar shows event colors; #tldr/#my-today in External Reports; bell reaches Slack | 🟡 **Google done** (OAuth connected, 119 events, real colors, meeting links). Slack tokens still yours to add |
| 1 | **W1 — Workbench spine** | Task/attempt/event schema; supervision engine (worktrees, timeouts, SIGTERM-safe, reconciliation); claude-headless + native adapters; cards + drawer UI (live tail, diff) | Delegate "research X" and "fix this bug" from one text box; both finish unattended; diff reviewed in-app | ✅ **Shipped 2026-07-21** — exit test passed on the real system (see WORKBENCH-PLAN §6) |
| 2 | **W2 — Executor breadth** | opencode-serve sidecar (SSE + approvals bridge); generic CLI adapter, pi + aider seeded; task-type defaults in Settings; retry-as-attempt | Same coding task run on Claude and opencode+qwen as sibling attempts, compared by diff | ⏭ **Next.** Retry-as-attempt already landed early in W1 |
| 3 | **W3 — Delegation UX** | Plan-gate w/ countdown; needs_input → Inbox (notify/question/review); steer-mid-run; best-of-N; merge/PR button; worktree sweeper; persistent ⌘K chat history; discoverability hints | A week of one-off tasks entirely through Workbench, terminal untouched | ⬜ |
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
