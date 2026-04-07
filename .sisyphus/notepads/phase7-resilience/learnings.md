# Phase 7 — Learnings

## [2026-04-01] Session ses_2bab9c227ffe03nCP4j9oOJUYX — Initial Setup

### Critical Sequencing Rules

- Token tracking (Task 4) MUST complete before circuit breaker Slack upgrade (Task 7) — callLLM reads estimated_cost_usd from executions but nothing writes it yet
- Wave 1 (Tasks 1-5) runs first — Task 1 is strictly sequential, Tasks 2-5 run parallel after Task 1
- Wave 2 (Tasks 6-11) runs after Wave 1 — all can run in parallel with each other
- Task 12 (tooling_config) is fully independent — can start any time
- Wave 3 (Tasks 13-14) depends on Wave 2 outputs. Task 14 is the final implementation.

### Key Facts Discovered

- No flyApi module exists — Task 3 creates it from scratch
- callLLM() has basic cost circuit breaker but no Slack alerting and reads 0 (nothing writes estimated_cost_usd)
- lifecycle.ts has placeholder machine ID `{ id: 'placeholder-machine-id' }` — Tasks 3 + 11 fix this
- redispatch.ts is a 27-line skeleton with TODO for elapsed time check
- waitForEvent has one location, zero pre-checks
- ~50+ console.log calls in src/workers/ and src/inngest/ need migration to structured logger
- agent_versions table exists with seed record but executions don't link to it at runtime

### Patterns in Codebase

- All API clients follow pattern in src/lib/github-client.ts — typed methods, withRetry() for 429
- PostgREST client in src/workers/lib/postgrest-client.ts used for worker→DB writes
- Prisma used from gateway/inngest side (lifecycle.ts uses prisma directly)
- Workers use PostgREST (no Prisma in worker process — Docker container)

### Must NOT Rules (from plan guardrails)

- Do NOT implement multi-department cost tracking (use "default" throughout)
- Do NOT add OpenTelemetry SDK (add trace_id as manual field only)
- Do NOT add log shipping (stdout only)
- Do NOT implement agent version feedback loop or performance comparison
- Do NOT auto-release cost-held tasks
- Do NOT add logger to gateway routes (src/workers/ and src/inngest/ only)
- Do NOT implement pre-warmed machine pool
