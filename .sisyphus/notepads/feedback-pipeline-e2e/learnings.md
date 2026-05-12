# Learnings — feedback-pipeline-e2e

## Task 1 (2026-05-12)

### Service State

- Gateway running via `scripts/dev.ts` (PID 78946) — no tmux session needed, already running
- Inngest at :8288 — healthy
- Socket Mode: confirmed connected (log shows "Slack Bolt — Socket Mode connected" + periodic reconnects which are normal)
- Docker: all ai-employee containers healthy (ai-employee-rest, ai-employee-kong, ai-employee-auth, shared-redis, shared-postgres)
- Dev log at `/tmp/ai-dev.log` (527MB — very large, use grep not tail for searching)

### DB Baseline (VLRE tenant)

- 32 total feedback rows, all unconsolidated (consolidated_at IS NULL), all have correction_reason
- 31 learned_rules: 1 confirmed, 1 proposed, 2 awaiting_input, 27 rejected
- 1 knowledge_bases row for archetype 00000000-0000-0000-0000-000000000015
- Consolidation threshold (5) already exceeded — cron will consolidate on next run

### Browser State

- Airbnb thread accessible and authenticated — compose bar visible
- Last message in thread: "Can I bring my dog? [e2e-threaduid-fix-1778531812]" from Olivia (Today 3:37 PM)
- Host (Leo) already replied to that message (Today 3:39 PM) — pre-check will auto-complete if triggered now
- Both Slack channels accessible: #cs-guest-communication and #victor-tests

### Key Observation

- The Airbnb thread currently has the host's last reply already sent — any new webhook trigger will
  hit the pre-check and auto-complete (no worker spawned). To test the full pipeline, Olivia needs
  to send a NEW message first.
