# Decisions — observability-strategy

## Confirmed Decisions (from user interview + Metis review)

- DB migration: approved (all columns nullable, no backfill)
- Transcript storage: full transcript (~100KB/task), not summary
- Test strategy: tests after implementation (not TDD)
- `failure_code` type: plain TEXT column, not Postgres enum
- `started_at` semantics: set when execution record is created (line 703 in harness) — "when worker container started working"
- `completed_at` semantics: set in harness after runOpencodeSession() returns successfully
- Multiple executions per task: dashboard shows most recent (ORDER BY created_at DESC LIMIT 1)
- Historical tasks with zero metrics: show "—" NOT "$0.00" or "0 tokens"
- Delivery phase execution tracking: explicitly excluded from scope (documented known gap)
- TaskFeed filters: in-memory React state only — no URL/localStorage persistence
- `triage_result` display: raw JSON viewer (collapsible) following RawEventViewer pattern
- Transcript size cap: none — accept full transcript (OpenCode 30-min timeout bounds it)

## Architecture Decisions

- OpenCode transcript fetched via `client.session.messages()` API (before server kill)
- Fallback: SQLite at ~/.local/share/opencode/opencode.db (if API fails after server death)
- Cost/token data: summed from per-message fields in transcript API response
- Dashboard never queries `SELECT *` on executions — always enumerate columns explicitly
