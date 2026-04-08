# Decisions — long-running-session-overhaul

## [2026-04-08] Architecture Decisions (from planning phase)

1. Two-phase architecture (Plan → Execute) with wave-based execution
2. Time budgets: 30min planning / 4h orchestrate / 6h completion / 8h total
3. Subagents DEFERRED to future plan
4. AGENTS.md: read + truncate at 8000 + skip if missing; NO @file parsing
5. Fallback draft PR on failure + per-task cost circuit breaker (between waves only)
6. Tests-after + mandatory agent QA
7. Watchdog machine cleanup: **9 hours** (raised from 4h — Metis hard blocker)
8. Plan persistence: BOTH Supabase (tasks.plan_content) + disk cache
9. **HARD CUTOVER, no feature flag** — user overrode Metis recommendation
10. One commit per wave, `feat(wave-N): {desc}`, pushed with `--force-with-lease`
11. Fix-loop KEPT as safety net

## Key Constants (baked into plan)

- TURBO_CONCURRENCY=2
- NEXUS_VITEST_MAX_WORKERS=2
- OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS=1200000
- NODE_OPTIONS=--max-old-space-size=4096
- Disk minimum: 2147483648 bytes (2 GB)
- Idle detection: 3 consecutive polls (completion detector)
- Polling interval: 30 seconds
- Wave per-task timeout: 90 minutes
- Max continuations per wave: 5
- AGENTS.md truncation: 8000 chars
- Inngest waitForEvent: 8h30m = 30600000 ms
- Watchdog machine cleanup: 9h = 32400000 ms
- Watchdog stale heartbeat: 20min = 1200000 ms
- Redispatch budget: 8h = 28800000 ms
